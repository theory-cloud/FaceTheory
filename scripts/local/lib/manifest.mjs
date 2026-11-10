import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export const CLASSES = ['L1', 'L2', 'L3', 'I'];
export const PENDING_MILESTONES = ['FT2', 'FT3'];
export const ROW_ID_PATTERN = /^[a-z0-9/-]+#[a-z0-9-]+$/;
export const RUNNER_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;
export const STORAGE_KINDS = ['isr', 'sidecar'];
export const STORAGE_RUNNERS = {
  isr: 'isr-real-storage',
  sidecar: 'strict-csp-real-storage',
};
const DIGEST_IMAGE_PATTERN = /@sha256:[0-9a-f]{64}$/;

const REQUIRED_ROW_FIELDS = ['id', 'class', 'runner'];
const GAP_REQUIRED_CLASSES = new Set(['L2', 'L3', 'I']);

export class ManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManifestError';
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function fileExists(root, relative) {
  try {
    return statSync(path.join(root, relative)).isFile();
  } catch {
    return false;
  }
}

function entrypointCovers(entrypoints, covered) {
  if (covered.endsWith('/')) {
    return entrypoints.some((entrypoint) => entrypoint.startsWith(covered));
  }
  return entrypoints.includes(covered);
}

/**
 * Validate the checked-in manifest against the tree. Every example directory
 * and infra stack must be classified, every discovered entrypoint must be
 * named by a row or covered by one, and every row must be coherent.
 */
export function validateManifest(root, manifest, tree) {
  const errors = [];
  const warnings = [];
  const rows = new Map();
  const portOwners = new Map();

  assert(isPlainObject(manifest), 'manifest must be a JSON object', errors);
  if (!isPlainObject(manifest)) return { rows: [], errors, warnings };
  assert(manifest.version === 1, 'manifest.version must be 1', errors);
  assert(isPlainObject(manifest.profile), 'manifest.profile is required', errors);
  assert(isPlainObject(manifest.entries), 'manifest.entries is required', errors);

  const profile = manifest.profile ?? {};
  const ports = profile.ports ?? {};
  const first = ports.first;
  const last = ports.last;
  assert(Number.isInteger(first) && Number.isInteger(last) && first <= last,
    'manifest.profile.ports.first and .last must be integers with first <= last', errors);
  const reserved = Array.isArray(ports.reserved) ? ports.reserved : [];
  for (const range of reserved) {
    assert(Array.isArray(range) && range.length === 2 && range.every(Number.isInteger),
      'manifest.profile.ports.reserved entries must be [first, last] integer pairs', errors);
  }

  const storagePorts = new Set();
  const storage = profile.storage;
  if (storage !== undefined) {
    assert(isPlainObject(storage), 'manifest.profile.storage must be an object', errors);
    const storagePortConfig = storage?.ports;
    assert(isPlainObject(storagePortConfig),
      'manifest.profile.storage.ports must be an object', errors);
    if (isPlainObject(storagePortConfig)) {
      for (const name of ['dynamodb', 's3']) {
        const port = storagePortConfig[name];
        assert(Number.isInteger(port),
          `manifest.profile.storage.ports.${name} must be an integer`, errors);
        if (Number.isInteger(port)) {
          if (Number.isInteger(first) && Number.isInteger(last)) {
            assert(port >= first && port <= last,
              `manifest.profile.storage.ports.${name} ${port} is outside the documented ${first}-${last} range`, errors);
          }
          if (storagePorts.has(port)) {
            errors.push(`manifest.profile.storage.ports.${name} ${port} collides with another storage port`);
          }
          storagePorts.add(port);
        }
      }
    }
    const containers = storage?.containers;
    assert(isPlainObject(containers),
      'manifest.profile.storage.containers must be an object', errors);
    if (isPlainObject(containers)) {
      for (const name of ['dynamodb-local', 's3proxy']) {
        const container = containers[name];
        assert(isPlainObject(container),
          `manifest.profile.storage.containers.${name} is required`, errors);
        if (!isPlainObject(container)) continue;
        assert(typeof container.image === 'string' && DIGEST_IMAGE_PATTERN.test(container.image),
          `manifest.profile.storage.containers.${name}.image must be pinned by digest`, errors);
        assert(Number.isInteger(container.containerPort) && container.containerPort > 0,
          `manifest.profile.storage.containers.${name}.containerPort must be a positive integer`, errors);
        if (container.command !== undefined) {
          assert(Array.isArray(container.command) && container.command.every((value) => typeof value === 'string'),
            `manifest.profile.storage.containers.${name}.command must be an array of strings`, errors);
        }
        if (container.environment !== undefined) {
          assert(isPlainObject(container.environment)
            && Object.values(container.environment).every((value) => typeof value === 'string'),
          `manifest.profile.storage.containers.${name}.environment must be an object of strings`, errors);
        }
      }
    }
  }

  const entries = manifest.entries ?? {};
  const treeExampleDirs = new Set(tree.examples.map((example) => example.directory));
  const treeInfraDirs = new Set(tree.infra.map((stack) => stack.directory));
  const treeEntrypoints = new Map(
    tree.examples.map((example) => [example.directory, new Set(example.entrypoints)]),
  );

  for (const directory of Object.keys(entries)) {
    if (!treeExampleDirs.has(directory) && !treeInfraDirs.has(directory)) {
      errors.push(`manifest entry ${directory} does not exist in the tree`);
    }
  }

  for (const [directory, entry] of Object.entries(entries)) {
    if (!isPlainObject(entry)) {
      errors.push(`manifest entry ${directory} must be an object`);
      continue;
    }
    const entryRows = Array.isArray(entry.rows) ? entry.rows : [];
    if (entryRows.length === 0 && typeof entry.verifiedBy !== 'string') {
      errors.push(`manifest entry ${directory} has no rows and no verifiedBy`);
    }
    if (entryRows.length === 0 && !isPlainObject(entry.coveredBy) && typeof entry.verifiedBy !== 'string') {
      errors.push(`manifest entry ${directory} has no rows, coveredBy or verifiedBy`);
    }

    for (const row of entryRows) {
      if (!isPlainObject(row)) {
        errors.push(`manifest entry ${directory} contains a non-object row`);
        continue;
      }
      const rowId = typeof row.id === 'string' ? row.id : `<missing id in ${directory}>`;
      const rowLabel = `row ${rowId}`;
      for (const field of REQUIRED_ROW_FIELDS) {
        assert(row[field] !== undefined && row[field] !== '',
          `${rowLabel}: missing required field ${field}`, errors);
      }
      assert(typeof row.id === 'string' && ROW_ID_PATTERN.test(row.id),
        `${rowLabel}: id must look like <example>#<row>`, errors);
      assert(rows.get(rowId) === undefined, `${rowLabel}: duplicate row id`, errors);
      assert(CLASSES.includes(row.class),
        `${rowLabel}: class must be one of ${CLASSES.join(', ')}`, errors);
      assert(!('skip' in row) && !('skipped' in row),
        `${rowLabel}: a skip is a failure; remove the skip field and classify the row`, errors);

      const pending = row.pending;
      if (pending !== undefined) {
        assert(PENDING_MILESTONES.includes(pending),
          `${rowLabel}: pending must be one of ${PENDING_MILESTONES.join(', ')}`, errors);
        assert(typeof row.gap === 'string' && row.gap.length > 0,
          `${rowLabel}: pending rows must name what is missing`, errors);
      } else if (GAP_REQUIRED_CLASSES.has(row.class)) {
        assert(typeof row.gap === 'string' && row.gap.length > 0,
          `${rowLabel}: ${row.class} rows must name a gap or fidelity limit`, errors);
      }
      if (row.class === 'L1') {
        assert(row.gap === undefined,
          `${rowLabel}: L1 rows must not declare a gap`, errors);
      }

      if (row.storage !== undefined) {
        assert(isPlainObject(row.storage), `${rowLabel}: storage must be an object`, errors);
        const kind = row.storage?.kind;
        assert(STORAGE_KINDS.includes(kind),
          `${rowLabel}: storage.kind must be one of ${STORAGE_KINDS.join(', ')}`, errors);
        assert(pending === undefined, `${rowLabel}: storage rows must not be pending`, errors);
        if (STORAGE_KINDS.includes(kind)) {
          assert(row.runner === STORAGE_RUNNERS[kind],
            `${rowLabel}: storage kind ${kind} must use runner ${STORAGE_RUNNERS[kind]}`, errors);
        }
      } else if (Object.values(STORAGE_RUNNERS).includes(row.runner)) {
        errors.push(`${rowLabel}: runner ${row.runner} requires a storage section`);
      }
      if (row.containerPrefix !== undefined) {
        assert(typeof row.containerPrefix === 'string' && /^[a-z0-9]{2,12}$/.test(row.containerPrefix),
          `${rowLabel}: containerPrefix must be 2-12 lowercase alphanumeric characters`, errors);
      }

      if (row.build !== undefined) {
        assert(Array.isArray(row.build), `${rowLabel}: build must be an array`, errors);
      }
      if (row.serve !== undefined) {
        assert(isPlainObject(row.serve), `${rowLabel}: serve must be an object`, errors);
        assert(['node', 'npm', 'apptheory-local'].includes(row.serve?.kind),
          `${rowLabel}: serve.kind must be node, npm or apptheory-local`, errors);
        if (row.serve?.kind === 'apptheory-local') {
          assert(typeof row.serve.app === 'string' && row.serve.app.length > 0,
            `${rowLabel}: apptheory-local serve rows must name serve.app`, errors);
          assert(Array.isArray(row.serve.backends)
            && row.serve.backends.every((backend) => typeof backend === 'string'),
            `${rowLabel}: apptheory-local serve.backends must be an array of strings`, errors);
          if (row.serve.publicSurface !== undefined) {
            assert(row.serve.publicSurface === 'cloudfront',
              `${rowLabel}: serve.publicSurface must be cloudfront`, errors);
          }
        }
        assert(pending === undefined, `${rowLabel}: pending rows must not serve`, errors);
        assert(Number.isInteger(row.port), `${rowLabel}: a serve row must reserve a port`, errors);
      }
      if (row.bundle !== undefined) {
        assert(isPlainObject(row.bundle), `${rowLabel}: bundle must be an object`, errors);
        assert(typeof row.bundle?.entry === 'string' && row.bundle.entry.length > 0,
          `${rowLabel}: bundle.entry must name a file`, errors);
        if (typeof row.bundle?.entry === 'string') {
          assert(fileExists(root, path.posix.join(directory, row.bundle.entry)),
            `${rowLabel}: bundle entry ${row.bundle.entry} does not exist`, errors);
        }
      }
      if (row.unreleasedProducer !== undefined) {
        errors.push(
          `${rowLabel}: unreleasedProducer is retired; every row runs against the released runner pinned in profile.apptheoryRunner`,
        );
      }
      if (row.port !== undefined) {
        assert(pending === undefined,
          `${rowLabel}: pending rows must not reserve a serving port`, errors);
        assert(row.serve !== undefined, `${rowLabel}: a port requires a serve recipe`, errors);
        assert(Number.isInteger(row.port), `${rowLabel}: port must be an integer`, errors);
        if (Number.isInteger(first) && Number.isInteger(last)) {
          assert(row.port >= first && row.port <= last,
            `${rowLabel}: port ${row.port} is outside the documented ${first}-${last} range`, errors);
        }
        for (const [reservedFirst, reservedLast] of reserved) {
          assert(row.port < reservedFirst || row.port > reservedLast,
            `${rowLabel}: port ${row.port} collides with reserved range ${reservedFirst}-${reservedLast}`, errors);
        }
        assert(!storagePorts.has(row.port),
          `${rowLabel}: port ${row.port} collides with the FT3 storage backend ports`, errors);
        if (portOwners.has(row.port)) {
          errors.push(`${rowLabel}: port ${row.port} is already used by ${portOwners.get(row.port)}`);
        } else {
          portOwners.set(row.port, rowId);
        }
      }

      const entrypoints = Array.isArray(row.entrypoints) ? row.entrypoints : [];
      if (entrypoints.length === 0) {
        errors.push(`${rowLabel}: entrypoints must name at least one existing file`);
      }
      for (const entrypoint of entrypoints) {
        if (typeof entrypoint !== 'string') {
          errors.push(`${rowLabel}: entrypoint ${String(entrypoint)} must be a string`);
          continue;
        }
        const relative = path.posix.join(directory, entrypoint);
        if (!fileExists(root, relative)) {
          errors.push(`${rowLabel}: entrypoint ${relative} does not exist`);
        }
      }
      if (typeof entry.verifiedBy === 'string') {
        assert(entry.verifiedBy !== row.id,
          `${rowLabel}: verifiedBy must name another row`, errors);
      }
      if (typeof row.verifiedBy === 'string') {
        assert(row.verifiedBy !== row.id, `${rowLabel}: verifiedBy must name another row`, errors);
      }

      if (row.runner === 'via-host') {
        assert(typeof row.verifiedBy === 'string' && row.verifiedBy.length > 0,
          `${rowLabel}: via-host rows must set verifiedBy`, errors);
      }
      rows.set(row.id, { ...row, directory });
    }

    const coveredBy = entry.coveredBy;
    if (isPlainObject(coveredBy)) {
      const discovered = treeEntrypoints.get(directory) ?? new Set();
      for (const [covered, rowId] of Object.entries(coveredBy)) {
        assert(typeof rowId === 'string' && rowId.length > 0,
          `manifest entry ${directory}: coveredBy ${covered} must name a row`, errors);
        const exists = covered.endsWith('/')
          ? [...discovered].some((entrypoint) => entrypoint.startsWith(covered))
          : discovered.has(covered) || fileExists(root, path.posix.join(directory, covered));
        assert(exists,
          `manifest entry ${directory}: coveredBy ${covered} does not match an entrypoint`, errors);
      }
    }
  }

  for (const entry of Object.values(entries)) {
    const coveredBy = entry?.coveredBy;
    if (isPlainObject(coveredBy)) {
      for (const [covered, rowId] of Object.entries(coveredBy)) {
        if (typeof rowId === 'string') {
          assert(rows.has(rowId),
            `manifest entry coveredBy ${covered} names unknown row ${rowId}`, errors);
        }
      }
    }
    for (const row of Array.isArray(entry?.rows) ? entry.rows : []) {
      if (typeof row?.verifiedBy === 'string') {
        assert(rows.has(row.verifiedBy),
          `manifest row ${String(row.id)} verifiedBy names unknown row ${row.verifiedBy}`, errors);
      }
    }
  }

  for (const directory of Object.keys(entries)) {
    const discovered = treeEntrypoints.get(directory);
    if (!discovered) continue;
    const entry = entries[directory];
    const named = new Set();
    for (const row of Array.isArray(entry.rows) ? entry.rows : []) {
      for (const entrypoint of Array.isArray(row.entrypoints) ? row.entrypoints : []) {
        named.add(entrypoint);
      }
    }
    const covered = isPlainObject(entry.coveredBy) ? Object.keys(entry.coveredBy) : [];
    for (const entrypoint of discovered) {
      const isNamed = named.has(entrypoint);
      const isCovered = covered.some((pattern) => entrypointCovers([entrypoint], pattern));
      if (!isNamed && !isCovered) {
        errors.push(`unmanifested entrypoint ${directory}/${entrypoint}; add a row or cover it explicitly`);
      }
    }
  }

  for (const example of tree.examples) {
    if (!entries[example.directory]) {
      errors.push(`unclassified example directory ${example.directory}; add it to the manifest`);
    }
  }
  for (const stack of tree.infra) {
    if (!entries[stack.directory]) {
      errors.push(`unclassified infra stack ${stack.directory}; add it to the manifest`);
    }
  }

  for (const retired of ['apptheoryCheckout', 'tabletheoryCheckout']) {
    if (profile[retired] !== undefined) {
      errors.push(
        `manifest.profile.${retired} is retired; the harness installs the released AppTheory runner pinned in profile.apptheoryRunner and consumes the released TableTheory package`,
      );
    }
  }
  const runner = profile.apptheoryRunner;
  assert(isPlainObject(runner), 'manifest.profile.apptheoryRunner is required', errors);
  if (isPlainObject(runner)) {
    assert(typeof runner.module === 'string' && runner.module.startsWith('github.com/theory-cloud/apptheory/'),
      'manifest.profile.apptheoryRunner.module must name the AppTheory module', errors);
    assert(typeof runner.package === 'string' && runner.package.endsWith('/cmd/apptheory-local'),
      'manifest.profile.apptheoryRunner.package must name the apptheory-local command', errors);
    assert(typeof runner.version === 'string' && RUNNER_VERSION_PATTERN.test(runner.version),
      'manifest.profile.apptheoryRunner.version must be an exact release tag such as v7.1.0', errors);
    if (typeof runner.module === 'string' && typeof runner.package === 'string') {
      assert(runner.package.startsWith(`${runner.module}/`),
        'manifest.profile.apptheoryRunner.package must belong to the declared module', errors);
    }
  }

  const storageRows = [...rows.values()].filter((row) => row.storage !== undefined);
  if (storageRows.length > 0) {
    assert(storage !== undefined,
      `rows ${storageRows.map((row) => row.id).join(', ')} declare storage but profile.storage is missing`, errors);
  }

  return { rows: [...rows.values()], errors, warnings };
}

/**
 * The ledger records pending rows that cannot run yet because they need an
 * unreleased producer. It is empty now that every row runs against the released
 * runner pinned in profile.apptheoryRunner. A pending row is still non-failing
 * only when the ledger names it; every other entry fails by name, so a stale
 * record left behind after a release cannot pass silently.
 */
export function validateLedger(ledger, rows) {
  const errors = [];
  const failures = [];
  const fail = (row, message) => {
    errors.push(message);
    failures.push({ row, message });
  };
  if (!isPlainObject(ledger)) {
    return { errors: ['ledger must be a JSON object'], failures };
  }
  if (ledger.version !== 1) errors.push('ledger.version must be 1');
  if (!Array.isArray(ledger.rows)) errors.push('ledger.rows must be an array');
  if (!Array.isArray(ledger.rows)) return { errors, failures };

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const ledgerByRow = new Map();
  for (const entry of ledger.rows) {
    if (!isPlainObject(entry) || typeof entry.row !== 'string') {
      errors.push('ledger row is missing a row id');
      continue;
    }
    if (ledgerByRow.has(entry.row)) {
      fail(entry.row, `ledger contains duplicate row ${entry.row}`);
      continue;
    }
    ledgerByRow.set(entry.row, entry);
    if (!rowsById.has(entry.row)) {
      errors.push(`ledger row ${entry.row} does not match a manifest row`);
      continue;
    }
    const manifestRow = rowsById.get(entry.row);
    if (entry.kind === 'record') {
      fail(
        entry.row,
        `ledger row ${entry.row} is a record; record entries are retired with the released runner and must be deleted`,
      );
      continue;
    }
    if (manifestRow.pending === undefined) {
      fail(
        entry.row,
        `ledger row ${entry.row} is not a pending manifest row; delete it`,
      );
      continue;
    }
    if (typeof entry.capability !== 'string' || entry.capability.length === 0) {
      fail(entry.row, `ledger row ${entry.row} must name the required producer capability`);
    }
    if (typeof entry.owner !== 'string' || entry.owner.length === 0) {
      fail(entry.row, `ledger row ${entry.row} must name an owner`);
    }
    if (typeof entry.resolution !== 'string' || entry.resolution.length === 0) {
      fail(entry.row, `ledger row ${entry.row} must state its release-cycle resolution`);
    }
  }

  for (const row of rows) {
    if (row.pending !== undefined && !ledgerByRow.has(row.id)) {
      fail(row.id, `pending row ${row.id} is missing from the ledger; a skip is a failure`);
    }
  }

  return { errors, failures };
}

export function loadRows(manifest) {
  const rows = [];
  for (const [directory, entry] of Object.entries(manifest.entries ?? {})) {
    for (const row of entry.rows ?? []) rows.push({ ...row, directory });
  }
  return rows;
}
