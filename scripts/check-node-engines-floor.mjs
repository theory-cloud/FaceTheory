// Purpose: fail when the FaceTheory lockfile set declares a Node floor, or an
// upstream engines.node range, that does not admit the repository Node floor.
//
// ===========================================================================
// Floor semantics
// ===========================================================================
// The floor major is the NODE_FLOOR_MAJOR constant below. It mirrors the
// engines.node floor ts/package.json publishes for the runtime package and the
// ["22", "24"] floor legs of the `ts` CI matrix in .github/workflows/ci.yml;
// the constant, the manifest floor, and the matrix legs move together.
//
// The floor CI leg installs the newest release on that line, which makes the
// floor runtime the whole `22.x` line: a dependency passes only when its
// declared engines.node range admits at least one Node 22.x release.
//
//   floor 22 | engines >=22                 -> pass
//   floor 22 | engines >=20                 -> pass (20.x tooling still runs)
//   floor 22 | engines ^22.13.0             -> pass (22.13.x is a 22.x)
//   floor 22 | engines 18 || 20 || >=22     -> pass
//   floor 22 | engines >=24                 -> FAIL
//   floor 22 | engines ^20.19.0 || >=24     -> FAIL
//   floor 22 | engines 20.x                 -> FAIL
//
// The matcher below is deliberately self-contained: a dependency gate must not
// depend on an npm package, and it must model every range it can meet rather
// than skip the ones it cannot. Grammar the matcher does not model fails the
// gate outright, and every `||` alternative is parsed before any is evaluated,
// so strictness never depends on the order of the alternatives.
//
// ===========================================================================
// Scope
// ===========================================================================
// The `packages` map of every lockfile in LOCKFILES. A dependency entry
// (node_modules/**) with a declared engines.node must admit the floor major, or
// the gate fails. A lockfile's root entry ("") is that project's own published
// floor rather than an upstream dependency, so it is reported instead of judged
// by the dependency rule - but a root that admits any release below the floor
// fails the gate, since the project itself would then install on a runtime the
// repository no longer supports.
//
// Fail-closed cases: a lockfile that is missing or unparseable, a lockfile
// without a `packages` map, a non-string engines.node, and any range the
// matcher does not model.
//
// The lockfile set is hardcoded and there is no exception list, no waiver flag,
// and no way to point the scan at a narrower set: every entry in scope is
// judged. `--self-test` is the only argument, and it runs the matcher's
// self-test plus synthetic-lockfile proofs before the real scan.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NODE_FLOOR_MAJOR = 22;

const LOCKFILES = [
  "ts/package-lock.json",
  "infra/apptheory-ssr-site/package-lock.json",
  "infra/apptheory-ssg-isr-site/package-lock.json",
];

const UNMODELLED_GRAMMAR_HINT =
  "extend the matcher in scripts/check-node-engines-floor.mjs - ranges are never skipped";

class UnmodelledRange extends Error {}

class GateFailure extends Error {}

function fail(message) {
  console.error(`node-engines-floor: FAIL (${message})`);
  process.exit(1);
}

// === semver range support ==================================================

const PARTIAL_RE =
  /^v?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parsePartial(rawText) {
  const match = PARTIAL_RE.exec(rawText.trim());
  if (match === null) return null;
  const component = (value) => {
    if (value === undefined || /^[xX*]$/.test(value)) return null;
    return Number(value);
  };
  const major = component(match[1]);
  const minor = component(match[2]);
  const patch = component(match[3]);
  const prerelease = match[4] ?? null;
  if (major === null) {
    // `*`, `x`, `X` and `v*` leave the major unconstrained.
    if (minor !== null || patch !== null || prerelease !== null) return null;
    return { any: true };
  }
  const wildcarded = minor === null || patch === null;
  if (wildcarded && prerelease !== null) return null;
  return {
    any: false,
    major,
    minor: minor ?? 0,
    patch: patch === null ? 0 : patch,
    prerelease,
    minorWildcard: minor === null,
    patchWildcard: minor !== null && patch === null,
  };
}

// A concrete version for comparisons: partial components already default to 0.
function concrete(version) {
  return {
    major: version.major,
    minor: version.minor,
    patch: version.patch,
    prerelease: version.prerelease ?? null,
  };
}

function bump(version, level) {
  if (level === "major") return { major: version.major + 1, minor: 0, patch: 0, prerelease: null };
  if (level === "minor") return { major: version.major, minor: version.minor + 1, patch: 0, prerelease: null };
  return { major: version.major, minor: version.minor, patch: version.patch + 1, prerelease: null };
}

function comparePrerelease(a, b) {
  const left = a.split(".");
  const right = b.split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      if (Number(l) !== Number(r)) return Number(l) < Number(r) ? -1 : 1;
      continue;
    }
    if (lNumeric !== rNumeric) return lNumeric ? -1 : 1;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

function compareVersions(a, b) {
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

function maxLower(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  const order = compareVersions(a.version, b.version);
  if (order > 0) return a;
  if (order < 0) return b;
  return { version: a.version, inclusive: a.inclusive && b.inclusive };
}

function minUpper(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  const order = compareVersions(a.version, b.version);
  if (order < 0) return a;
  if (order > 0) return b;
  return { version: a.version, inclusive: a.inclusive && b.inclusive };
}

function applyXRange(version, bounds) {
  if (version.minorWildcard) {
    bounds.lower = maxLower(bounds.lower, { version: concrete(version), inclusive: true });
    bounds.upper = minUpper(bounds.upper, { version: bump(version, "major"), inclusive: false });
    return;
  }
  if (version.patchWildcard) {
    bounds.lower = maxLower(bounds.lower, { version: concrete(version), inclusive: true });
    bounds.upper = minUpper(bounds.upper, { version: bump(version, "minor"), inclusive: false });
    return;
  }
  bounds.lower = maxLower(bounds.lower, { version: concrete(version), inclusive: true });
  bounds.upper = minUpper(bounds.upper, { version: concrete(version), inclusive: true });
}

function caretUpper(version) {
  if (version.major > 0 || version.minorWildcard) return bump(version, "major");
  if (version.minor > 0 || version.patchWildcard) return bump(version, "minor");
  return bump(version, "patch");
}

function applyComparator(rawToken, bounds) {
  const token = rawToken.trim();
  if (token === "" || token === "*" || /^[xX]$/.test(token)) return;

  const match = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(token);
  if (match === null) throw new UnmodelledRange(token);
  const operator = match[1] ?? "";
  const version = parsePartial(match[2]);
  if (version === null) throw new UnmodelledRange(token);
  if (version.any) {
    if (operator === "" || operator === "=") return;
    throw new UnmodelledRange(token);
  }

  const lower = (candidate, inclusive) => {
    bounds.lower = maxLower(bounds.lower, { version: candidate, inclusive });
  };
  const upper = (candidate, inclusive) => {
    bounds.upper = minUpper(bounds.upper, { version: candidate, inclusive });
  };

  switch (operator) {
    case ">=":
      lower(concrete(version), true);
      return;
    case ">":
      if (version.minorWildcard) lower(bump(version, "major"), true);
      else if (version.patchWildcard) lower(bump(version, "minor"), true);
      else lower(concrete(version), false);
      return;
    case "<=":
      if (version.minorWildcard) upper(bump(version, "major"), false);
      else if (version.patchWildcard) upper(bump(version, "minor"), false);
      else upper(concrete(version), true);
      return;
    case "<":
      upper(concrete(version), false);
      return;
    case "=":
    case "":
      applyXRange(version, bounds);
      return;
    case "^":
      lower(concrete(version), true);
      upper(caretUpper(version), false);
      return;
    case "~":
      lower(concrete(version), true);
      upper(version.minorWildcard ? bump(version, "major") : bump(version, "minor"), false);
      return;
    default:
      throw new UnmodelledRange(token);
  }
}

function applyHyphen(leftText, rightText, bounds) {
  const lowerVersion = parsePartial(leftText);
  const upperVersion = parsePartial(rightText);
  if (lowerVersion === null || upperVersion === null || lowerVersion.any || upperVersion.any) {
    throw new UnmodelledRange(`${leftText} - ${rightText}`);
  }
  bounds.lower = maxLower(bounds.lower, { version: concrete(lowerVersion), inclusive: true });
  if (upperVersion.minorWildcard) {
    bounds.upper = minUpper(bounds.upper, { version: bump(upperVersion, "major"), inclusive: false });
  } else if (upperVersion.patchWildcard) {
    bounds.upper = minUpper(bounds.upper, { version: bump(upperVersion, "minor"), inclusive: false });
  } else {
    bounds.upper = minUpper(bounds.upper, { version: concrete(upperVersion), inclusive: true });
  }
}

function branchBounds(rawBranch) {
  // `>= 4.0.0` and `>=4.0.0` are the same range; glue the operator back onto its
  // version so whitespace splitting only separates comparator sets.
  const text = rawBranch.replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").trim();
  const bounds = { lower: null, upper: null };
  if (text === "" || text === "*" || /^[xX]$/.test(text)) return bounds;

  const hyphen = /^([^\s]+)\s+-\s+([^\s]+)$/.exec(text);
  if (hyphen !== null) {
    applyHyphen(hyphen[1], hyphen[2], bounds);
    return bounds;
  }

  for (const token of text.split(/\s+/)) applyComparator(token, bounds);
  return bounds;
}

// Every branch is parsed before any of them is evaluated, so an unmodelled
// branch fails the gate even when an earlier branch already matches.
function parseBranches(rawRange) {
  return String(rawRange)
    .split("||")
    .map((branch) => branchBounds(branch));
}

function intersectsBand(bounds, band) {
  const lower = maxLower(bounds.lower, band.lower);
  const upper = minUpper(bounds.upper, band.upper);
  if (lower === null || upper === null) return true;
  const order = compareVersions(lower.version, upper.version);
  if (order < 0) return true;
  return order === 0 && lower.inclusive && upper.inclusive;
}

// True when the range admits at least one release on the floor's major line,
// i.e. when it intersects [floorMajor.0.0, (floorMajor + 1).0.0).
function rangeAdmitsFloorMajor(rawRange, floorMajor) {
  const band = {
    lower: { version: { major: floorMajor, minor: 0, patch: 0, prerelease: null }, inclusive: true },
    upper: { version: { major: floorMajor + 1, minor: 0, patch: 0, prerelease: null }, inclusive: false },
  };
  return parseBranches(rawRange).some((bounds) => intersectsBand(bounds, band));
}

// True when the range admits any release below the floor line, i.e. when it
// intersects [0.0.0, floorMajor.0.0).
function rangeAdmitsBelowFloorMajor(rawRange, floorMajor) {
  const band = {
    lower: null,
    upper: { version: { major: floorMajor, minor: 0, patch: 0, prerelease: null }, inclusive: false },
  };
  return parseBranches(rawRange).some((bounds) => intersectsBand(bounds, band));
}

// === scan ==================================================================

function resolveLockfile(label) {
  return path.isAbsolute(label) ? label : path.join(repositoryRoot, label);
}

function readPackages(label) {
  const absolute = resolveLockfile(label);
  let text;
  try {
    text = fs.readFileSync(absolute, "utf8");
  } catch (err) {
    throw new GateFailure(`could not read lockfile ${label}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new GateFailure(`could not parse lockfile ${label}: ${err.message}`);
  }
  const packages = parsed?.packages;
  if (packages === undefined || typeof packages !== "object" || packages === null) {
    throw new GateFailure(`${label} is missing its packages map`);
  }
  return packages;
}

function scanLockfile(label, floorMajor) {
  const outcome = {
    label,
    projectFloor: null,
    dependencyRanges: 0,
    distinctRanges: new Set(),
    violations: [],
  };

  for (const [packagePath, entry] of Object.entries(readPackages(label))) {
    const declared = entry?.engines?.node;
    if (declared === undefined || declared === null) continue;
    if (typeof declared !== "string") {
      throw new GateFailure(
        `${label} ${packagePath || "<root>"} declares a non-string engines.node (${JSON.stringify(declared)})`,
      );
    }

    try {
      if (packagePath === "") {
        outcome.projectFloor = declared;
        if (rangeAdmitsBelowFloorMajor(declared, floorMajor)) {
          outcome.violations.push({ label, kind: "project", packagePath, version: null, declared });
        }
        continue;
      }
      outcome.dependencyRanges += 1;
      outcome.distinctRanges.add(declared);
      if (!rangeAdmitsFloorMajor(declared, floorMajor)) {
        outcome.violations.push({
          label,
          kind: "dependency",
          packagePath,
          version: entry?.version ?? null,
          declared,
        });
      }
    } catch (err) {
      if (!(err instanceof UnmodelledRange)) throw err;
      throw new UnmodelledRange(
        `${label} ${packagePath || "<root>"} declares engines.node ${JSON.stringify(declared)}, which ` +
          `scripts/check-node-engines-floor.mjs does not model (${err.message}); ${UNMODELLED_GRAMMAR_HINT}`,
      );
    }
  }

  return outcome;
}

function describeViolation(violation, floorMajor) {
  if (violation.kind === "project") {
    return (
      `${violation.label} project floor ${JSON.stringify(violation.declared)} admits a Node release ` +
      `below ${floorMajor}.0.0`
    );
  }
  return (
    `${violation.label} ${violation.packagePath}@${violation.version ?? "<unknown>"} declares engines.node ` +
    `${JSON.stringify(violation.declared)}, which excludes Node ${floorMajor}.x`
  );
}

// === self-test =============================================================

// [range, floorMajor, admits]
const MATCHER_CASES = [
  // Ranges that admit the floor major.
  ["", NODE_FLOOR_MAJOR, true],
  ["*", NODE_FLOOR_MAJOR, true],
  ["x", NODE_FLOOR_MAJOR, true],
  [">=22", NODE_FLOOR_MAJOR, true],
  [">= 22.0.0", NODE_FLOOR_MAJOR, true],
  [">=20", NODE_FLOOR_MAJOR, true],
  [">= 18", NODE_FLOOR_MAJOR, true],
  [">=16 || 14 >=14.17", NODE_FLOOR_MAJOR, true],
  [">= 14.6", NODE_FLOOR_MAJOR, true],
  [">=0.4", NODE_FLOOR_MAJOR, true],
  [">=8.x", NODE_FLOOR_MAJOR, true],
  [">=14.x", NODE_FLOOR_MAJOR, true],
  [">=v12.22.7", NODE_FLOOR_MAJOR, true],
  ["6.* || 8.* || >= 10.*", NODE_FLOOR_MAJOR, true],
  ["^10 || ^12 || ^13.7 || ^14 || >=15.0.1", NODE_FLOOR_MAJOR, true],
  ["^8.16.0 || ^10.6.0 || >=11.0.0", NODE_FLOOR_MAJOR, true],
  ["^22.13.0", NODE_FLOOR_MAJOR, true],
  ["^20.19.0 || ^22.12.0 || >=24.0.0", NODE_FLOOR_MAJOR, true],
  ["^20.19 || ^22.12 || >=24", NODE_FLOOR_MAJOR, true],
  ["^18.18.0 || ^20.9.0 || >=21.1.0", NODE_FLOOR_MAJOR, true],
  ["18 || 20 || >=22", NODE_FLOOR_MAJOR, true],
  ["20 || >=22", NODE_FLOOR_MAJOR, true],
  [">=21", NODE_FLOOR_MAJOR, true],
  [">21", NODE_FLOOR_MAJOR, true],
  ["22", NODE_FLOOR_MAJOR, true],
  ["22.x", NODE_FLOOR_MAJOR, true],
  ["22.4.x", NODE_FLOOR_MAJOR, true],
  ["22.0.0 - 22.4.0", NODE_FLOOR_MAJOR, true],
  ["<=22", NODE_FLOOR_MAJOR, true],
  ["<23", NODE_FLOOR_MAJOR, true],
  ["<23.0.0", NODE_FLOOR_MAJOR, true],
  ["~22.1.0", NODE_FLOOR_MAJOR, true],
  // Ranges that exclude the floor major.
  [">=24", NODE_FLOOR_MAJOR, false],
  [">24", NODE_FLOOR_MAJOR, false],
  [">=26", NODE_FLOOR_MAJOR, false],
  ["24.x", NODE_FLOOR_MAJOR, false],
  ["^20.19.0", NODE_FLOOR_MAJOR, false],
  ["20.x", NODE_FLOOR_MAJOR, false],
  ["^20.19.0 || >=24", NODE_FLOOR_MAJOR, false],
  ["18 || 20", NODE_FLOOR_MAJOR, false],
  [">=6 <7", NODE_FLOOR_MAJOR, false],
  ["^6 || ^7 || ^8", NODE_FLOOR_MAJOR, false],
  ["<22", NODE_FLOOR_MAJOR, false],
  ["<=21", NODE_FLOOR_MAJOR, false],
  ["21 - 21.9", NODE_FLOOR_MAJOR, false],
  // The drift class against a lower floor: this is what the gate exists to catch.
  [">=22", 20, false],
  [">=20", 20, true],
];

// Grammar the matcher does not model must fail the gate, including when another
// alternative on the same line already admits the floor.
const UNMODELLED_CASES = [">=20 || lts/*", ">=22 || ^foo", "nightly"];

// [range, admits a release below the floor major]
const ROOT_FLOOR_CASES = [
  [">=22", false],
  [">=22.0.0", false],
  ["22.x", false],
  ["^22.13.0", false],
  [">=24", false],
  [">=20", true],
  ["*", true],
  ["", true],
  ["^18", true],
  [">=20.19.0 || >=22", true],
];

const SYNTHETIC_CASES = [
  {
    name: "dependency-excludes-floor",
    packages: {
      "": { engines: { node: ">=22" } },
      "node_modules/floor-too-high": { version: "1.2.3", engines: { node: ">=24" } },
      "node_modules/floor-on-line": { version: "0.0.1", engines: { node: ">=20" } },
    },
    expectedViolations: ["dependency node_modules/floor-too-high >=24"],
  },
  {
    name: "dependency-admits-floor",
    packages: {
      "": { engines: { node: ">=22" } },
      "node_modules/floor-on-line": {
        version: "0.0.1",
        engines: { node: "^20.19.0 || ^22.12.0 || >=24.0.0" },
      },
    },
    expectedViolations: [],
  },
  {
    name: "project-floor-below-floor",
    packages: {
      "": { engines: { node: ">=20" } },
      "node_modules/floor-on-line": { version: "0.0.1", engines: { node: ">=22" } },
    },
    expectedViolations: ["project <root> >=20"],
  },
];

function selfTestViolationLabel(violation) {
  return `${violation.kind} ${violation.packagePath || "<root>"} ${violation.declared}`;
}

function writeSyntheticLockfile(tempDir, name, packages) {
  const file = path.join(tempDir, name, "package-lock.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ lockfileVersion: 3, packages }, null, 2));
  return file;
}

function runSelfTest() {
  const failures = [];
  let matcherCases = 0;

  for (const [rawRange, floorMajor, expected] of MATCHER_CASES) {
    matcherCases += 1;
    let admitted;
    try {
      admitted = rangeAdmitsFloorMajor(rawRange, floorMajor);
    } catch (err) {
      failures.push(`range ${JSON.stringify(rawRange)} at floor ${floorMajor} threw ${err.message}`);
      continue;
    }
    if (admitted !== expected) {
      failures.push(
        `range ${JSON.stringify(rawRange)} at floor ${floorMajor} expected ${expected}, got ${admitted}`,
      );
    }
  }

  for (const rawRange of UNMODELLED_CASES) {
    matcherCases += 1;
    try {
      const admitted = rangeAdmitsFloorMajor(rawRange, NODE_FLOOR_MAJOR);
      failures.push(`range ${JSON.stringify(rawRange)} was accepted (${admitted}) as grammar the matcher models`);
    } catch (err) {
      if (!(err instanceof UnmodelledRange)) {
        failures.push(`range ${JSON.stringify(rawRange)} threw ${err.message} instead of failing closed`);
      }
    }
  }

  for (const [rawRange, expected] of ROOT_FLOOR_CASES) {
    matcherCases += 1;
    let admittedBelow;
    try {
      admittedBelow = rangeAdmitsBelowFloorMajor(rawRange, NODE_FLOOR_MAJOR);
    } catch (err) {
      failures.push(`project floor ${JSON.stringify(rawRange)} threw ${err.message}`);
      continue;
    }
    if (admittedBelow !== expected) {
      failures.push(
        `project floor ${JSON.stringify(rawRange)} expected below-floor ${expected}, got ${admittedBelow}`,
      );
    }
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "facetheory-node-engines-floor-"));
  try {
    for (const scenario of SYNTHETIC_CASES) {
      const file = writeSyntheticLockfile(tempDir, scenario.name, scenario.packages);
      let observed;
      try {
        observed = scanLockfile(file, NODE_FLOOR_MAJOR).violations.map(selfTestViolationLabel);
      } catch (err) {
        failures.push(`synthetic lockfile ${scenario.name} threw ${err.message}`);
        continue;
      }
      const expected = scenario.expectedViolations;
      const matched = observed.length === expected.length && observed.every((value, i) => value === expected[i]);
      if (!matched) {
        failures.push(
          `synthetic lockfile ${scenario.name} expected violations ${JSON.stringify(expected)}, ` +
            `got ${JSON.stringify(observed)}`,
        );
      }
      console.log(
        `  self-test synthetic ${scenario.name}: ${observed.length === 0 ? "PASS" : `FAIL ${observed.join("; ")}`}`,
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  self-test: ${failure}`);
    throw new GateFailure(
      `self-test failed (${failures.length} failures across ${matcherCases + SYNTHETIC_CASES.length} cases)`,
    );
  }

  return { matcherCases, syntheticCases: SYNTHETIC_CASES.length };
}

// === entry point ===========================================================

function main() {
  const args = process.argv.slice(2);
  const unsupported = args.filter((arg) => arg !== "--self-test");
  if (unsupported.length > 0) {
    fail(`unsupported arguments ${unsupported.join(" ")} (this gate takes no arguments)`);
  }
  const selfTest = args.includes("--self-test");
  const selfTestCounts = selfTest ? runSelfTest() : null;

  let outcomes;
  try {
    outcomes = LOCKFILES.map((label) => scanLockfile(label, NODE_FLOOR_MAJOR));
  } catch (err) {
    if (err instanceof GateFailure || err instanceof UnmodelledRange) fail(err.message);
    throw err;
  }

  const violations = outcomes.flatMap((outcome) => outcome.violations);
  const dependencyRanges = outcomes.reduce((total, outcome) => total + outcome.dependencyRanges, 0);
  const distinctRanges = new Set(outcomes.flatMap((outcome) => [...outcome.distinctRanges])).size;

  for (const outcome of outcomes) {
    const declared = outcome.projectFloor === null ? "<none>" : JSON.stringify(outcome.projectFloor);
    console.log(
      `  ${outcome.label} project engines.node ${declared} (${outcome.dependencyRanges} dependency engine ranges)`,
    );
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`node-engines-floor: ${describeViolation(violation, NODE_FLOOR_MAJOR)}`);
    }
    fail(
      `${violations.length} engine declaration(s) violate the Node ${NODE_FLOOR_MAJOR} floor ` +
        `(${dependencyRanges} dependency engine ranges across ${outcomes.length} lockfiles)`,
    );
  }

  const selfTestSummary = selfTestCounts
    ? `self-test ${selfTestCounts.matcherCases} matcher cases + ${selfTestCounts.syntheticCases} synthetic lockfiles; `
    : "";
  console.log(
    `node-engines-floor: PASS (${selfTestSummary}floor Node ${NODE_FLOOR_MAJOR}.x; ` +
      `lockfiles ${outcomes.length}; dependency engine ranges ${dependencyRanges}; ` +
      `distinct ranges ${distinctRanges})`,
  );
}

main();
