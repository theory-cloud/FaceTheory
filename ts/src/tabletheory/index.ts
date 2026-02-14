import {
  createFaceTheoryIsrMetaStore,
  type FaceTheoryIsrMetaStore,
  type FaceTheoryIsrMetaStoreConfig,
  type FaceTheoryIsrMeta,
} from '@theory-cloud/tabletheory-ts';

import type {
  CommitIsrGenerationInput,
  IsrMetaRecord,
  IsrMetaStore,
  ReleaseIsrLeaseInput,
  TryAcquireIsrLeaseInput,
  TryAcquireIsrLeaseResult,
} from '../isr.js';

const DEFAULT_STATUS = 200;
const DEFAULT_CONTENT_TYPE = 'text/html; charset=utf-8';

function normalizeRevalidateSeconds(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function recordFromTableTheoryMeta(cacheKey: string, meta: FaceTheoryIsrMeta): IsrMetaRecord {
  return {
    cacheKey,
    htmlPointer: meta.htmlPointer ?? null,
    generatedAt: Number(meta.generatedAtMs ?? 0),
    revalidateSeconds: normalizeRevalidateSeconds(Number(meta.revalidateSeconds ?? 0)),
    status: DEFAULT_STATUS,
    contentType: DEFAULT_CONTENT_TYPE,
    etag: typeof meta.etag === 'string' ? meta.etag : null,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: 0,
  };
}

function defaultRecord(cacheKey: string, fallbackRevalidateSeconds: number): IsrMetaRecord {
  return {
    cacheKey,
    htmlPointer: null,
    generatedAt: 0,
    revalidateSeconds: normalizeRevalidateSeconds(fallbackRevalidateSeconds),
    status: DEFAULT_STATUS,
    contentType: DEFAULT_CONTENT_TYPE,
    etag: null,
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: 0,
  };
}

export interface TableTheoryIsrMetaStoreAdapterOptions {
  defaultStatus?: number;
  defaultContentType?: string;
}

export class TableTheoryIsrMetaStoreAdapter implements IsrMetaStore {
  private readonly inner: FaceTheoryIsrMetaStore;
  private readonly defaultStatus: number;
  private readonly defaultContentType: string;

  constructor(inner: FaceTheoryIsrMetaStore, options: TableTheoryIsrMetaStoreAdapterOptions = {}) {
    this.inner = inner;
    this.defaultStatus = Number.isFinite(options.defaultStatus ?? NaN)
      ? Math.trunc(Number(options.defaultStatus))
      : DEFAULT_STATUS;
    this.defaultContentType = String(options.defaultContentType ?? DEFAULT_CONTENT_TYPE).trim() || DEFAULT_CONTENT_TYPE;
  }

  async get(cacheKey: string): Promise<IsrMetaRecord | null> {
    const meta = await this.inner.get({ cacheKey });
    if (!meta) return null;
    return {
      ...recordFromTableTheoryMeta(cacheKey, meta),
      status: this.defaultStatus,
      contentType: this.defaultContentType,
    };
  }

  async tryAcquireLease(input: TryAcquireIsrLeaseInput): Promise<TryAcquireIsrLeaseResult> {
    const existingMeta = await this.inner.get({ cacheKey: input.cacheKey });
    const base = existingMeta
      ? {
          ...recordFromTableTheoryMeta(input.cacheKey, existingMeta),
          status: this.defaultStatus,
          contentType: this.defaultContentType,
        }
      : {
          ...defaultRecord(input.cacheKey, input.fallbackRevalidateSeconds),
          status: this.defaultStatus,
          contentType: this.defaultContentType,
        };

    const lease = await this.inner.tryAcquireLease({
      cacheKey: input.cacheKey,
      leaseOwner: input.leaseOwner,
      nowMs: input.nowMs,
      leaseDurationMs: input.leaseDurationMs,
    });

    if (!lease) {
      return {
        acquired: false,
        record: base,
        leaseToken: null,
      };
    }

    const record: IsrMetaRecord = {
      ...base,
      leaseOwner: input.leaseOwner,
      leaseToken: lease.leaseToken,
      leaseExpiresAt: lease.leaseExpiresAtMs,
    };

    return {
      acquired: true,
      record,
      leaseToken: lease.leaseToken,
    };
  }

  async commitGeneration(input: CommitIsrGenerationInput): Promise<void> {
    if (!Number.isFinite(input.revalidateSeconds) || input.revalidateSeconds <= 0) {
      throw new Error(
        `TableTheory FaceTheoryIsrMetaStore requires revalidateSeconds > 0 (got ${input.revalidateSeconds})`,
      );
    }

    await this.inner.commitGeneration({
      cacheKey: input.cacheKey,
      leaseOwner: input.leaseOwner,
      leaseToken: input.leaseToken,
      htmlPointer: input.htmlPointer,
      generatedAtMs: input.generatedAt,
      revalidateSeconds: input.revalidateSeconds,
      ...(typeof input.etag === 'string' ? { etag: input.etag } : {}),
    });
  }

  async releaseLease(input: ReleaseIsrLeaseInput): Promise<void> {
    await this.inner.releaseLease({
      cacheKey: input.cacheKey,
      leaseOwner: input.leaseOwner,
      leaseToken: input.leaseToken,
    });
  }
}

export interface CreateTableTheoryIsrMetaStoreOptions extends TableTheoryIsrMetaStoreAdapterOptions {
  config: FaceTheoryIsrMetaStoreConfig;
}

export function createTableTheoryIsrMetaStore(options: CreateTableTheoryIsrMetaStoreOptions): IsrMetaStore {
  const inner = createFaceTheoryIsrMetaStore(options.config);
  return new TableTheoryIsrMetaStoreAdapter(inner, options);
}
