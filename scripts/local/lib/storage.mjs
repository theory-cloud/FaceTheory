import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { RunError, assert, checkoutId } from './runtime.mjs';

const requireFromTs = createRequire(
  new URL('../../../ts/package.json', import.meta.url),
);
const OWNER_LABEL = 'ft3.owner';
const MANAGED_LABEL = 'ft3.managed';

let activeBackends = null;

function sdk(name) {
  return requireFromTs(name);
}

function dynamo() {
  return sdk('@aws-sdk/client-dynamodb');
}

function s3() {
  return sdk('@aws-sdk/client-s3');
}

export function storageProfile(manifest) {
  return manifest?.profile?.storage ?? null;
}

export function storageNames(root) {
  const id = checkoutId(root);
  return {
    id,
    network: `ft3-${id}-net`,
    dynamodb: `ft3-${id}-dynamodb-local`,
    s3: `ft3-${id}-s3proxy`,
  };
}

export function rowSlug(rowId) {
  return String(rowId)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function storageNamesForRow(row) {
  const slug = rowSlug(row.id);
  return {
    slug,
    bucket: `ft3-${slug}`,
    tableName: `ft3-${slug}-facetheory-cache`,
    prefix: row.storage?.kind === 'isr' ? 'isr' : '',
  };
}

export function dynamoClient(endpoint) {
  const { DynamoDBClient } = dynamo();
  return new DynamoDBClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  });
}

export function s3Client(endpoint) {
  const { S3Client } = s3();
  return new S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: 'dummy', secretAccessKey: 'dummy' },
  });
}

function docker(args, { allowFailure = false } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new RunError(
      `docker ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim() || `exit ${result.status}`}`,
    );
  }
  return result;
}

function containerExists(name) {
  return docker(['inspect', '--format', '{{.Id}}', name], { allowFailure: true }).status === 0;
}

function networkExists(name) {
  return (
    docker(['network', 'inspect', '--format', '{{.Id}}', name], {
      allowFailure: true,
    }).status === 0
  );
}

function containerOwner(name) {
  const result = docker(
    ['inspect', '--format', `{{index .Config.Labels "${OWNER_LABEL}"}}`, name],
    { allowFailure: true },
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

function networkOwner(name) {
  const result = docker(
    ['network', 'inspect', '--format', `{{index .Labels "${OWNER_LABEL}"}}`, name],
    { allowFailure: true },
  );
  return result.status === 0 ? result.stdout.trim() : '';
}

function assertOwned(kind, name, owner, id) {
  if (owner !== id) {
    throw new RunError(
      `${kind} ${name} exists but is not owned by this checkout (${OWNER_LABEL}=${owner || 'missing'}); refusing to touch it`,
    );
  }
}

function ensureNetwork(names) {
  if (networkExists(names.network)) {
    assertOwned('network', names.network, networkOwner(names.network), names.id);
    return;
  }
  docker([
    'network',
    'create',
    '--label',
    `${OWNER_LABEL}=${names.id}`,
    '--label',
    `${MANAGED_LABEL}=true`,
    names.network,
  ]);
}

function containerRunArgs({ names, name, config, hostPort, aliases }) {
  const args = [
    'run',
    '-d',
    '--name',
    name,
    '--label',
    `${OWNER_LABEL}=${names.id}`,
    '--label',
    `${MANAGED_LABEL}=true`,
    '--network',
    names.network,
  ];
  for (const alias of aliases) args.push('--network-alias', alias);
  args.push('-p', `127.0.0.1:${hostPort}:${config.containerPort}`);
  for (const [key, value] of Object.entries(config.environment ?? {})) {
    args.push('-e', `${key}=${value}`);
  }
  args.push(config.image, ...(config.command ?? []));
  return args;
}

function ensureContainer({ names, name, config, hostPort, aliases }) {
  if (containerExists(name)) {
    assertOwned('container', name, containerOwner(name), names.id);
    const running = docker(
      ['inspect', '--format', '{{.State.Running}}', name],
      { allowFailure: true },
    );
    if (running.status === 0 && running.stdout.trim() !== 'true') {
      docker(['start', name]);
    }
    return;
  }
  docker(containerRunArgs({ names, name, config, hostPort, aliases }));
}

async function waitFor(check, label, timeoutMs = 60_000) {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      await check();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new RunError(`${label} did not become ready within ${timeoutMs}ms: ${lastError}`);
}

async function backendReady(endpoints) {
  const { ListTablesCommand } = dynamo();
  const { ListBucketsCommand } = s3();
  const ddb = dynamoClient(endpoints.dynamodb);
  const store = s3Client(endpoints.s3);
  await waitFor(
    () => ddb.send(new ListTablesCommand({})),
    `DynamoDB Local at ${endpoints.dynamodb}`,
  );
  await waitFor(
    () => store.send(new ListBucketsCommand({})),
    `s3proxy at ${endpoints.s3}`,
  );
}

/**
 * Start this checkout's FT3 DynamoDB Local and s3proxy containers on the
 * reserved 8250-8259 storage ports. The containers carry an exact-name label so
 * cleanup removes only resources this checkout created.
 */
export async function ensureStorageBackends({ root, manifest }) {
  const profile = storageProfile(manifest);
  if (!profile) return null;
  if (activeBackends) return activeBackends;

  const names = storageNames(root);
  const available = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
  });
  if (available.status !== 0) {
    throw new RunError(
      `Docker is required for the FT3 storage backends but its daemon is not reachable: ${
        (available.stderr || available.stdout || '').trim() || 'docker version failed'
      }`,
    );
  }

  ensureNetwork(names);
  ensureContainer({
    names,
    name: names.dynamodb,
    config: profile.containers['dynamodb-local'],
    hostPort: profile.ports.dynamodb,
    aliases: ['dynamodb-local'],
  });
  ensureContainer({
    names,
    name: names.s3,
    config: profile.containers.s3proxy,
    hostPort: profile.ports.s3,
    aliases: ['s3proxy'],
  });

  const endpoints = {
    dynamodb: `http://127.0.0.1:${profile.ports.dynamodb}`,
    s3: `http://127.0.0.1:${profile.ports.s3}`,
  };
  await backendReady(endpoints);
  activeBackends = { names, endpoints, profile };
  return activeBackends;
}

/**
 * Remove only the exact containers and network this checkout created. A
 * resource whose owner label does not match is reported and left alone.
 */
export async function stopStorageBackends({ root, manifest }) {
  const profile = storageProfile(manifest);
  if (!profile) return [];
  const names = storageNames(root);
  const results = [];
  for (const name of [names.dynamodb, names.s3]) {
    if (!containerExists(name)) continue;
    if (containerOwner(name) !== names.id) {
      results.push({ name, stopped: false, reason: 'not owned by this checkout' });
      continue;
    }
    docker(['rm', '-f', name], { allowFailure: true });
    results.push({ name, stopped: true, reason: 'removed' });
  }
  if (networkExists(names.network)) {
    if (networkOwner(names.network) !== names.id) {
      results.push({ name: names.network, stopped: false, reason: 'not owned by this checkout' });
    } else {
      docker(['network', 'rm', names.network], { allowFailure: true });
      results.push({ name: names.network, stopped: true, reason: 'removed' });
    }
  }
  activeBackends = null;
  return results;
}

export function storageEnv({ bucket, tableName, prefix, endpoints }) {
  return {
    AWS_ENDPOINT_URL: endpoints.dynamodb,
    AWS_ENDPOINT_URL_DYNAMODB: endpoints.dynamodb,
    AWS_ENDPOINT_URL_S3: endpoints.s3,
    FACETHEORY_ISR_BUCKET: bucket,
    FACETHEORY_CACHE_TABLE_NAME: tableName,
    APPTHEORY_CACHE_TABLE_NAME: tableName,
    ...(prefix ? { FACETHEORY_ISR_PREFIX: prefix } : {}),
  };
}

/**
 * The ISR table shape comes from TableTheory's FaceTheory model, never from a
 * hand-written copy. The metadata and lease models must agree, so one table
 * backs both.
 */
export function isrTableSpec() {
  const { defineFaceTheoryCacheMetadataModel, defineFaceTheoryCacheLeaseModel } =
    requireFromTs('@theory-cloud/tabletheory-ts/facetheory');
  const metadata = defineFaceTheoryCacheMetadataModel('ft3-model-probe');
  const lease = defineFaceTheoryCacheLeaseModel('ft3-model-probe');
  const shape = (model) => ({
    partition: model.schema.keys.partition,
    sort: model.schema.keys.sort,
    pk: model.roles.pk,
    sk: model.roles.sk,
    ttl: model.roles.ttl,
  });
  const metadataShape = shape(metadata);
  const leaseShape = shape(lease);
  if (
    !metadataShape.partition ||
    !metadataShape.sort ||
    !metadataShape.pk ||
    !metadataShape.sk ||
    !metadataShape.ttl ||
    !leaseShape.partition ||
    !leaseShape.sort ||
    !leaseShape.pk ||
    !leaseShape.sk ||
    !leaseShape.ttl
  ) {
    throw new RunError('the TableTheory FaceTheory ISR model does not define pk, sk and ttl');
  }
  if (
    JSON.stringify(leaseShape) !== JSON.stringify(metadataShape)
  ) {
    throw new RunError(
      'the TableTheory FaceTheory metadata and lease models no longer share one key/TTL shape',
    );
  }
  return {
    model: metadata.name,
    partitionKey: metadataShape.partition.attribute,
    partitionType: metadataShape.partition.type,
    sortKey: metadataShape.sort.attribute,
    sortType: metadataShape.sort.type,
    ttlAttribute: metadataShape.ttl,
  };
}

function tableInput(tableName, spec) {
  return {
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: spec.partitionKey, AttributeType: spec.partitionType },
      { AttributeName: spec.sortKey, AttributeType: spec.sortType },
    ],
    KeySchema: [
      { AttributeName: spec.partitionKey, KeyType: 'HASH' },
      { AttributeName: spec.sortKey, KeyType: 'RANGE' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  };
}

async function tableShape(ddb, tableName) {
  const { DescribeTableCommand } = dynamo();
  const out = await ddb.send(new DescribeTableCommand({ TableName: tableName }));
  const table = out.Table;
  return {
    attributes: (table.AttributeDefinitions ?? []).map((attribute) => ({
      AttributeName: attribute.AttributeName,
      AttributeType: attribute.AttributeType,
    })),
    keys: (table.KeySchema ?? []).map((key) => ({
      AttributeName: key.AttributeName,
      KeyType: key.KeyType,
    })),
  };
}

async function waitForTableActive(ddb, tableName) {
  const { DescribeTableCommand } = dynamo();
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    const out = await ddb.send(new DescribeTableCommand({ TableName: tableName }));
    if (out.Table?.TableStatus === 'ACTIVE') return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new RunError(`DynamoDB table ${tableName} did not become ACTIVE within 60s`);
}

export async function ensureIsrTable({ ddb, tableName }) {
  const spec = isrTableSpec();
  const {
    CreateTableCommand,
    DescribeTableCommand,
    DescribeTimeToLiveCommand,
    ResourceNotFoundException,
    UpdateTimeToLiveCommand,
  } = dynamo();
  let exists = true;
  try {
    await ddb.send(new DescribeTableCommand({ TableName: tableName }));
  } catch (error) {
    if (error instanceof ResourceNotFoundException) exists = false;
    else throw error;
  }
  if (!exists) {
    await ddb.send(new CreateTableCommand(tableInput(tableName, spec)));
    await waitForTableActive(ddb, tableName);
  } else {
    const expected = {
      attributes: [
        { AttributeName: spec.partitionKey, AttributeType: spec.partitionType },
        { AttributeName: spec.sortKey, AttributeType: spec.sortType },
      ],
      keys: [
        { AttributeName: spec.partitionKey, KeyType: 'HASH' },
        { AttributeName: spec.sortKey, KeyType: 'RANGE' },
      ],
    };
    const actual = await tableShape(ddb, tableName);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new RunError(
        `DynamoDB table ${tableName} does not match the TableTheory ISR model: ${JSON.stringify(actual)}`,
      );
    }
  }
  const ttl = await ddb.send(
    new DescribeTimeToLiveCommand({ TableName: tableName }),
  );
  const status = ttl.TimeToLiveDescription?.TimeToLiveStatus;
  const attribute = ttl.TimeToLiveDescription?.AttributeName;
  if (status !== 'ENABLED' || attribute !== spec.ttlAttribute) {
    await ddb.send(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: {
          AttributeName: spec.ttlAttribute,
          Enabled: true,
        },
      }),
    );
  }
  return spec;
}

export async function ensureBucket({ client, bucket }) {
  const { HeadBucketCommand, CreateBucketCommand } = s3();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status !== 404 && error?.name !== 'NotFound') throw error;
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
}

/**
 * Prepare one example row's isolated bucket and ISR table, and return the
 * runtime environment the example reads.
 */
export async function prepareRowStorage({ root, manifest, row }) {
  const backends = await ensureStorageBackends({ root, manifest });
  if (!backends) {
    throw new RunError(`${row.id}: the manifest has no profile.storage section`);
  }
  const names = storageNamesForRow(row);
  const ddb = dynamoClient(backends.endpoints.dynamodb);
  const store = s3Client(backends.endpoints.s3);
  await ensureBucket({ client: store, bucket: names.bucket });
  const spec = await ensureIsrTable({ ddb, tableName: names.tableName });
  return {
    ...names,
    ...backends.endpoints,
    endpoints: backends.endpoints,
    spec,
    env: storageEnv({ ...names, endpoints: backends.endpoints }),
  };
}

// ---------------------------------------------------------------------------
// Storage reads used by the row assertions.

function attribute(item, name) {
  const value = item?.[name];
  if (!value || typeof value !== 'object') return undefined;
  if ('S' in value) return value.S;
  if ('N' in value) return Number(value.N);
  if ('BOOL' in value) return value.BOOL;
  return undefined;
}

export async function scanTable({ endpoint, tableName }) {
  const { ScanCommand } = dynamo();
  const ddb = dynamoClient(endpoint);
  const items = [];
  let exclusiveStartKey;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );
    items.push(...(out.Items ?? []));
    exclusiveStartKey = out.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

export async function getDynamoItem({ endpoint, tableName, key }) {
  const { GetItemCommand } = dynamo();
  const ddb = dynamoClient(endpoint);
  const out = await ddb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: Object.fromEntries(
        Object.entries(key).map(([name, value]) => [
          name,
          typeof value === 'number' ? { N: String(value) } : { S: String(value) },
        ]),
      ),
    }),
  );
  return out.Item;
}

export async function describeTtl({ endpoint, tableName }) {
  const { DescribeTimeToLiveCommand } = dynamo();
  const ddb = dynamoClient(endpoint);
  const out = await ddb.send(new DescribeTimeToLiveCommand({ TableName: tableName }));
  return out.TimeToLiveDescription;
}

export async function listObjects({ endpoint, bucket, prefix = '' }) {
  const { ListObjectsV2Command } = s3();
  const client = s3Client(endpoint);
  const objects = [];
  let token;
  do {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ...(prefix ? { Prefix: prefix } : {}),
        ...(token ? { ContinuationToken: token } : {}),
      }),
    );
    for (const object of out.Contents ?? []) {
      if (object.Key) objects.push(object.Key);
    }
    token = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

export async function getObject({ endpoint, bucket, key }) {
  const { GetObjectCommand } = s3();
  const client = s3Client(endpoint);
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = Buffer.from(await out.Body.transformToByteArray());
  return {
    body,
    contentType: out.ContentType,
    cacheControl: out.CacheControl,
    metadata: out.Metadata ?? {},
    etag: out.ETag,
  };
}

/**
 * Read a host loopback port published by a producer-managed container. The
 * container is selected by its exact name and the managed label is verified
 * first, so this never inspects an unrelated container.
 */
export function publishedPort(container, containerPort) {
  const managed = docker(
    ['inspect', '--format', '{{index .Config.Labels "apptheory.local.managed"}}', container],
    { allowFailure: true },
  );
  if (managed.status !== 0) {
    throw new RunError(`producer container ${container} is not present`);
  }
  if (managed.stdout.trim() !== 'true') {
    throw new RunError(`container ${container} is not producer-managed; refusing to inspect it`);
  }
  const result = docker(['port', container, `${containerPort}/tcp`], { allowFailure: true });
  if (result.status !== 0) {
    throw new RunError(`producer container ${container} publishes no port ${containerPort}`);
  }
  const match = /127\.0\.0\.1:(\d+)/.exec(result.stdout);
  if (!match) {
    throw new RunError(
      `producer container ${container} port ${containerPort} is not loopback: ${result.stdout.trim()}`,
    );
  }
  return `http://127.0.0.1:${match[1]}`;
}

/**
 * The host endpoints of the dynamodb and s3proxy backends a producer run
 * started for `prefix`.
 */
export function gatewayBackendEndpoints(prefix) {
  return {
    dynamodb: publishedPort(`${prefix}-dynamodb`, 8000),
    s3: publishedPort(`${prefix}-s3proxy`, 80),
  };
}

async function tableAdapter({ root, endpoint, tableName }) {
  const module = await import(
    pathToFileURL(path.join(root, 'ts/dist/tabletheory/index.js')).href
  );
  const store = module.createTableTheoryIsrMetaStore({
    config: { ddb: dynamoClient(endpoint), tableName },
  });
  return { module, store };
}

/**
 * Observe the documented `invalidate()` limitation on the real local table: it
 * must refuse with IsrInvalidateUnsupportedError and leave storage untouched.
 */
export async function assertInvalidateUnsupported({ root, storage, cacheKey }) {
  const { module, store } = await tableAdapter({
    root,
    endpoint: storage.endpoints.dynamodb,
    tableName: storage.tableName,
  });
  let observed;
  try {
    await store.invalidate(cacheKey);
  } catch (error) {
    observed = error;
  }
  assert(
    observed instanceof module.IsrInvalidateUnsupportedError,
    `invalidate() must throw IsrInvalidateUnsupportedError, got ${observed?.name ?? 'no error'}`,
  );
  const item = await getDynamoItem({
    endpoint: storage.endpoints.dynamodb,
    tableName: storage.tableName,
    key: { pk: `CACHE#${cacheKey}`, sk: 'META' },
  });
  assert(!item, 'invalidate() must not write or delete a metadata item');
  return observed.message;
}

/**
 * Acquire a real lease through the TableTheory adapter and return the stored
 * item. The caller owns the release.
 */
export async function holdLease({ root, storage, cacheKey, leaseOwner = 'ft3-harness' }) {
  const { store } = await tableAdapter({
    root,
    endpoint: storage.endpoints.dynamodb,
    tableName: storage.tableName,
  });
  const acquired = await store.tryAcquireLease({
    cacheKey,
    leaseOwner,
    nowMs: Date.now(),
    leaseDurationMs: 60_000,
    fallbackRevalidateSeconds: 30,
  });
  assert(acquired.acquired === true && acquired.leaseToken, 'the local lease was not acquired');
  const item = await getDynamoItem({
    endpoint: storage.endpoints.dynamodb,
    tableName: storage.tableName,
    key: { pk: `CACHE#${cacheKey}`, sk: 'LOCK' },
  });
  assert(item, 'the acquired lease item is missing from DynamoDB Local');
  const token = attribute(item, 'lease_token');
  const expiresAt = attribute(item, 'lease_expires_at');
  const ttl = attribute(item, 'ttl');
  assert(token === acquired.leaseToken, 'the stored lease token does not match the adapter token');
  assert(Number.isFinite(expiresAt) && expiresAt > 0, 'lease_expires_at is missing');
  assert(Number.isFinite(ttl) && ttl >= expiresAt, 'the lease ttl is missing or before expiry');

  return {
    store,
    leaseOwner,
    leaseToken: acquired.leaseToken,
    token,
    expiresAt,
    ttl,
    release: () =>
      store.releaseLease({
        cacheKey,
        leaseOwner,
        leaseToken: acquired.leaseToken,
      }),
  };
}

/**
 * Acquire and release a real lease through the TableTheory adapter so the
 * model's lease fields and TTL attribute are observed in DynamoDB Local.
 */
export async function observeLease({ root, storage, cacheKey, leaseOwner = 'ft3-harness' }) {
  const lease = await holdLease({ root, storage, cacheKey, leaseOwner });
  await lease.release();
  const after = await getDynamoItem({
    endpoint: storage.endpoints.dynamodb,
    tableName: storage.tableName,
    key: { pk: `CACHE#${cacheKey}`, sk: 'LOCK' },
  });
  assert(!after, 'the released lease item is still present');
  return { token: lease.token, expiresAt: lease.expiresAt, ttl: lease.ttl };
}

export function valueOf(item, name) {
  return attribute(item, name);
}
