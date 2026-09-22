// Purpose: fail when a FaceTheory surface that declares an AWS Lambda runtime
// declares one AWS has deprecated.
//
// ===========================================================================
// Why this gate exists
// ===========================================================================
// AWS deprecates Lambda runtimes on a published schedule, and CDK reports the
// move as a synth-time WARNING. A warning is not a gate: it is easy to read past
// for years, and the previous rubric evidence for this repository recorded
// exactly two such warnings while every check stayed green. Meanwhile the real
// deadline is not "the function stops working" but "you can no longer create a
// function on that runtime", which is a hard stop for a new stack, a new
// region, or a disaster-recovery rebuild. This gate turns the warning into a
// failure at PR time.
//
// ===========================================================================
// The deprecated set
// ===========================================================================
// DEPRECATED_LAMBDA_RUNTIMES below is the one place the deprecated set lives.
// It covers the whole nodejs family up to and including nodejs20.x, which is
// the minimum AWS requires of this gate. SUPPORTED_LAMBDA_RUNTIMES is the
// matching positive set.
//
// A declared runtime that is in neither set fails the gate, so admitting a
// runtime is a deliberate edit to this file rather than something an unmodelled
// value slips past. The self-test proves the two sets and the enum map cannot
// drift apart: every nodejs runtime below 22 that the enum map can name must
// also be listed as deprecated.
//
// ===========================================================================
// Scope
// ===========================================================================
// SCANNED_SURFACES are the surfaces that decide the runtime of the Lambda
// functions FaceTheory ships or scaffolds:
//
//   infra/apptheory-ssr-site/src/stack.ts       reference SSR stack
//   infra/apptheory-ssg-isr-site/src/stack.ts   reference SSG+ISR stack
//   ts/src/create-templates/index.ts            `facetheory create` scaffold
//
// Coverage is enforced rather than assumed. SCAN_ROOTS is walked and every file
// under it that declares a Lambda runtime must be a declared surface; a file
// that declares one without being listed fails the gate, so a new reference
// stack cannot arrive declaring a runtime nobody judges. Symmetrically, a
// declared surface must exist and must still declare at least one modelled
// runtime, so the gate cannot be neutered by deleting a line or by switching a
// surface to a runtime value the model cannot read.
//
// Two directories are deliberately outside the walk, for stated reasons rather
// than convenience:
//
//   test/__snapshots__  A synthesized template is a pure function of the stack
//                       source that IS judged, so gating the source gates the
//                       snapshot - `make infra-snapshot-test` then fails if they
//                       disagree. Snapshots also carry runtimes that are not
//                       Lambda runtimes at all (CloudFront Functions report
//                       `cloudfront-js-2.0`, CDK's custom-resource providers
//                       report `python3.13`), and judging those here would mean
//                       modelling runtimes this repository does not deploy.
//
//   docs/               Deploy examples in docs/cdk/README.md and
//                       docs/getting-started.md follow the stacks by review
//                       convention; no gate links them. Keeping them out of the
//                       scan leaves that convention intact rather than
//                       silently converting it into an enforced one.
//
// Fail-closed cases: a surface that is missing, unreadable, or declares no
// modelled runtime; a runtime literal in a modelled shape whose family or value
// is not modelled; a declaration that names an unpinned moving alias rather
// than a pinned runtime; and any file inside SCAN_ROOTS that declares a Lambda
// runtime without being a declared surface.
//
// The scope is owned by this checker and there is no allowlist, no waiver flag,
// and no exception list. EXPECTED_SCANNED_SURFACES and EXPECTED_SCAN_ROOTS are
// independent copies of the scope, so the self-test fails when either is
// narrowed. `--self-test` is the only argument, and it runs the classifier
// self-test plus synthetic surfaces driven through the real read path before
// the real scan.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// === the deprecated set, explicit in one place =============================

const DEPRECATED_LAMBDA_RUNTIMES = [
  "nodejs",
  "nodejs4.3",
  "nodejs4.3-edge",
  "nodejs6.10",
  "nodejs8.10",
  "nodejs10.x",
  "nodejs12.x",
  "nodejs14.x",
  "nodejs16.x",
  "nodejs18.x",
  "nodejs20.x",
];

const SUPPORTED_LAMBDA_RUNTIMES = ["nodejs22.x", "nodejs24.x"];

const SCANNED_SURFACES = [
  "infra/apptheory-ssr-site/src/stack.ts",
  "infra/apptheory-ssg-isr-site/src/stack.ts",
  "ts/src/create-templates/index.ts",
];

// The scanned set, restated independently of SCANNED_SURFACES so the self-test
// catches a scan scope that was narrowed instead of widened.
const EXPECTED_SCANNED_SURFACES = [
  "infra/apptheory-ssr-site/src/stack.ts",
  "infra/apptheory-ssg-isr-site/src/stack.ts",
  "ts/src/create-templates/index.ts",
];

const SCAN_ROOTS = ["infra", "ts/src"];

const EXPECTED_SCAN_ROOTS = ["infra", "ts/src"];

// Directory names the coverage walk does not descend into. `__snapshots__` is
// the derived-output exclusion argued in the header; the rest are dependency,
// build, coverage, and vendored trees that hold no declaration of ours.
const SKIPPED_DIRECTORY_NAMES = new Set([
  "node_modules",
  "dist",
  "coverage",
  "__snapshots__",
  "cdk.out",
  ".cdk.staging",
  "vendor",
]);

// CDK's enum names for the runtimes this gate can name. An enum name that is
// absent here fails the gate rather than being skipped, so a runtime has to be
// added deliberately.
const LAMBDA_RUNTIME_ENUMS = new Map([
  ["NODEJS", "nodejs"],
  ["NODEJS_4_3", "nodejs4.3"],
  ["NODEJS_6_10", "nodejs6.10"],
  ["NODEJS_8_10", "nodejs8.10"],
  ["NODEJS_10_X", "nodejs10.x"],
  ["NODEJS_12_X", "nodejs12.x"],
  ["NODEJS_14_X", "nodejs14.x"],
  ["NODEJS_16_X", "nodejs16.x"],
  ["NODEJS_18_X", "nodejs18.x"],
  ["NODEJS_20_X", "nodejs20.x"],
  ["NODEJS_22_X", "nodejs22.x"],
  ["NODEJS_24_X", "nodejs24.x"],
]);

// `NODEJS_LATEST` is not a pinned runtime: it is an alias that follows the CDK
// version, so a dependency bump would change what these stacks deploy without a
// line of stack code changing. That is the opposite of the pinned-snapshot
// contract the reference stacks exist to hold, so it fails on its own reason
// rather than being reported as deprecated.
const UNPINNED_RUNTIME_ALIAS_ENUMS = new Set(["NODEJS_LATEST"]);

const LAMBDA_RUNTIME_FAMILIES = [
  "nodejs",
  "python",
  "ruby",
  "java",
  "dotnet",
  "dotnetcore",
  "go",
  "provided",
];

const UNMODELLED_DECLARATION_HINT =
  "add the runtime deliberately to DEPRECATED_LAMBDA_RUNTIMES or SUPPORTED_LAMBDA_RUNTIMES " +
  "in scripts/check-lambda-runtime-deprecations.mjs - declarations are never skipped";

class GateFailure extends Error {}

function fail(message) {
  console.error(`lambda-runtime-deprecations: FAIL (${message})`);
  process.exit(1);
}

// === declaration forms =====================================================

// Constant-style members only, so `lambda.Runtime.NODEJS_20_X` is a declaration
// while `lambda.Runtime.fromString(...)` is not: a method's argument is judged
// by the literal rule below, and an unmodelled dynamic runtime leaves the
// surface without a declaration, which fails closed on its own.
const ENUM_DECLARATION_RE = /\blambda\.Runtime\.([A-Z][A-Z0-9_]*)\b/g;

// Quoted strings that could be a runtime identifier. Deliberately loose - the
// predicate below decides, so a candidate that is not a runtime is simply not a
// declaration. It must be loose rather than an alternation of family names so
// that an unfamiliar runtime family still reaches the classifier and fails
// closed instead of being invisible.
const QUOTED_LITERAL_RE = /["'`]([a-z][a-z0-9._-]{2,})["'`]/g;

// The identifier a quoted string names, or null when it is not runtime-shaped.
// A runtime identifier is a known family followed by a version component, so
// `nodejs20.x` and `provided.al2023` are declarations while `node_modules`,
// `assets`, and `go.mod` are not.
function runtimeIdentifierFromLiteral(value) {
  const match = /^([a-z][a-z0-9-]*?)(\.al[0-9]+|[0-9][0-9A-Za-z._-]*)$/.exec(value);
  if (match === null) return null;
  return LAMBDA_RUNTIME_FAMILIES.includes(match[1]) ? value : null;
}

function lineOf(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === "\n") line += 1;
  }
  return line;
}

// Collects every runtime declaration in a surface's text, in source order, as
// { line, form, identifier, enumName }. `identifier` is null when the form
// could not be resolved to a runtime, and `enumName` is null for literal forms.
function collectDeclarations(text) {
  const declarations = [];
  for (const match of text.matchAll(ENUM_DECLARATION_RE)) {
    const enumName = match[1];
    declarations.push({
      index: match.index,
      line: lineOf(text, match.index),
      form: `lambda.Runtime.${enumName}`,
      enumName,
      identifier: LAMBDA_RUNTIME_ENUMS.get(enumName) ?? null,
    });
  }
  for (const match of text.matchAll(QUOTED_LITERAL_RE)) {
    const identifier = runtimeIdentifierFromLiteral(match[1]);
    if (identifier === null) continue;
    declarations.push({
      index: match.index,
      line: lineOf(text, match.index),
      form: `"${match[1]}"`,
      enumName: null,
      identifier,
    });
  }
  declarations.sort((left, right) => left.index - right.index);
  return declarations;
}

// === classification ========================================================

// Classifies one declaration. Returns a violation object, or null when the
// declaration is a supported pinned runtime.
function classifyDeclaration(declaration) {
  if (declaration.enumName !== null && UNPINNED_RUNTIME_ALIAS_ENUMS.has(declaration.enumName)) {
    return {
      kind: "unpinned-alias",
      line: declaration.line,
      form: declaration.form,
      detail:
        `names the moving alias lambda.Runtime.${declaration.enumName}, which follows the CDK ` +
        `version instead of pinning a runtime`,
    };
  }
  if (declaration.identifier === null) {
    return {
      kind: "unmodelled-enum",
      line: declaration.line,
      form: declaration.form,
      detail:
        `names the runtime enum ${declaration.enumName}, which ` +
        `scripts/check-lambda-runtime-deprecations.mjs does not model; ${UNMODELLED_DECLARATION_HINT}`,
    };
  }
  if (DEPRECATED_LAMBDA_RUNTIMES.includes(declaration.identifier)) {
    return {
      kind: "deprecated",
      line: declaration.line,
      form: declaration.form,
      detail: `declares '${declaration.identifier}', which AWS has deprecated`,
    };
  }
  if (SUPPORTED_LAMBDA_RUNTIMES.includes(declaration.identifier)) return null;
  return {
    kind: "unmodelled-runtime",
    line: declaration.line,
    form: declaration.form,
    detail:
      `declares '${declaration.identifier}', which is neither a deprecated runtime nor a ` +
      `supported pinned runtime; ${UNMODELLED_DECLARATION_HINT}`,
  };
}

// === scan ==================================================================

function resolveSurface(label) {
  return path.isAbsolute(label) ? label : path.join(repositoryRoot, label);
}

function scanSurface(label) {
  const absolute = resolveSurface(label);
  let text;
  try {
    text = fs.readFileSync(absolute, "utf8");
  } catch (err) {
    throw new GateFailure(`could not read scanned surface ${label}: ${err.message}`);
  }
  const declarations = collectDeclarations(text);
  if (declarations.length === 0) {
    throw new GateFailure(
      `${label} declares no modelled Lambda runtime; a scanned surface must still declare one, ` +
        `so the gate cannot be neutered by deleting or obfuscating its runtime`,
    );
  }
  return {
    label,
    declarationCount: declarations.length,
    violations: declarations
      .map(classifyDeclaration)
      .filter((violation) => violation !== null)
      .map((violation) => ({ ...violation, label })),
  };
}

// Every file inside SCAN_ROOTS that declares a Lambda runtime, whether or not it
// is a declared surface. Used to fail closed on an unmodelled surface.
function collectDeclarationSurfaces() {
  const found = new Set();

  const visit = (absolute) => {
    const entries = fs.readdirSync(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) continue;
        visit(child);
        continue;
      }
      if (!entry.isFile()) continue;
      let text;
      try {
        text = fs.readFileSync(child, "utf8");
      } catch {
        continue;
      }
      if (collectDeclarations(text).length > 0) {
        found.add(path.relative(repositoryRoot, child));
      }
    }
  };

  for (const root of SCAN_ROOTS) {
    const absolute = path.join(repositoryRoot, root);
    if (!fs.existsSync(absolute)) {
      throw new GateFailure(`scan root ${root} is missing; the coverage scope cannot be walked`);
    }
    visit(absolute);
  }

  return [...found].sort();
}

function describeViolation(violation) {
  return `${violation.label}:${violation.line} ${violation.form} ${violation.detail}`;
}

// === self-test =============================================================

// [text, expected violation kinds] - driven through the real read path.
const CLASSIFIER_CASES = [
  {
    name: "supported-pinned-runtime",
    text: "const ssrFunction = new NodejsFunction(this, 'SsrFunction', {\n  runtime: lambda.Runtime.NODEJS_24_X,\n});\n",
    expected: [],
  },
  {
    name: "supported-floor-runtime",
    text: "runtime: lambda.Runtime.NODEJS_22_X,\n",
    expected: [],
  },
  {
    name: "deprecated-runtime",
    text: "runtime: lambda.Runtime.NODEJS_20_X,\n",
    expected: ["deprecated"],
  },
  {
    name: "deprecated-runtime-older-than-the-minimum",
    text: "runtime: lambda.Runtime.NODEJS_4_3,\n",
    expected: ["deprecated"],
  },
  {
    name: "deprecated-runtime-in-a-scaffold-template-literal",
    text: "export const INFRA_STACK = `\n  runtime: lambda.Runtime.NODEJS_18_X,\n`;\n",
    expected: ["deprecated"],
  },
  {
    name: "unpinned-moving-alias",
    text: "runtime: lambda.Runtime.NODEJS_LATEST,\n",
    expected: ["unpinned-alias"],
  },
  {
    name: "unmodelled-enum",
    text: "runtime: lambda.Runtime.PYTHON_3_13,\n",
    expected: ["unmodelled-enum"],
  },
  {
    name: "unmodelled-runtime-literal",
    text: "runtime: lambda.Runtime.fromString('python3.13'),\n",
    expected: ["unmodelled-runtime"],
  },
  {
    name: "deprecated-runtime-literal",
    text: "runtime: lambda.Runtime.fromString('nodejs18.x'),\n",
    expected: ["deprecated"],
  },
  {
    name: "supported-runtime-literal",
    text: "runtime: lambda.Runtime.fromString('nodejs24.x'),\n",
    expected: [],
  },
  {
    name: "provided-al2023-literal",
    text: "runtime: lambda.Runtime.fromString('provided.al2023'),\n",
    expected: ["unmodelled-runtime"],
  },
  {
    name: "every-declaration-is-judged",
    text: "runtime: lambda.Runtime.NODEJS_24_X,\nruntime: lambda.Runtime.NODEJS_20_X,\nruntime: lambda.Runtime.NODEJS_16_X,\n",
    expected: ["deprecated", "deprecated"],
  },
  {
    name: "quoted-strings-that-are-not-runtimes",
    text: 'runtime: lambda.Runtime.NODEJS_24_X,\nconst a = "node_modules";\nconst b = "assets";\nconst c = ">=22";\nconst d = "go.mod";\nconst e = "vite";\nconst f = "1.2.3";\n',
    expected: [],
  },
];

const FAIL_CLOSED_CASES = [
  {
    name: "surface-without-a-declaration",
    text: "export const nothing = 1;\n",
    expectFailureReason: "declares no modelled Lambda runtime",
  },
  {
    name: "surface-of-only-quoted-non-runtimes",
    text: 'const a = "node_modules";\nconst b = "1.2.3";\n',
    expectFailureReason: "declares no modelled Lambda runtime",
  },
];

function selfTestViolationKinds(outcome) {
  return outcome.violations.map((violation) => violation.kind);
}

function writeSyntheticSurface(tempDir, scenario) {
  const file = path.join(tempDir, scenario.name, "surface.ts");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, scenario.text);
  return file;
}

function runSelfTest() {
  const failures = [];
  let classifierCases = 0;

  const scopeCases = 2;
  let scopeMatches =
    SCANNED_SURFACES.length === EXPECTED_SCANNED_SURFACES.length &&
    SCANNED_SURFACES.every((label, index) => label === EXPECTED_SCANNED_SURFACES[index]);
  if (!scopeMatches) {
    failures.push(
      `scanned surface set must be exactly ${JSON.stringify(EXPECTED_SCANNED_SURFACES)}, ` +
        `got ${JSON.stringify(SCANNED_SURFACES)}`,
    );
  }
  console.log(
    `  self-test scan scope: ${scopeMatches ? `surfaces ${SCANNED_SURFACES.length}` : "NOT THE EXPECTED SET"}`,
  );

  const rootMatches =
    SCAN_ROOTS.length === EXPECTED_SCAN_ROOTS.length &&
    SCAN_ROOTS.every((root, index) => root === EXPECTED_SCAN_ROOTS[index]);
  if (!rootMatches) {
    failures.push(
      `coverage scan roots must be exactly ${JSON.stringify(EXPECTED_SCAN_ROOTS)}, ` +
        `got ${JSON.stringify(SCAN_ROOTS)}`,
    );
  }
  console.log(
    `  self-test coverage scope: ${rootMatches ? `roots ${SCAN_ROOTS.length}` : "NOT THE EXPECTED SET"}`,
  );

  // The declared surface list and the coverage walk must agree, or the gate has
  // an unmodelled surface before it even starts scanning.
  try {
    const discovered = collectDeclarationSurfaces();
    const expected = [...SCANNED_SURFACES].sort();
    if (discovered.join("\n") !== expected.join("\n")) {
      failures.push(
        `coverage walk under ${JSON.stringify(SCAN_ROOTS)} must find exactly the declared surfaces; ` +
          `found ${JSON.stringify(discovered)}`,
      );
    }
    console.log(
      `  self-test coverage walk: ${discovered.join("\n") === expected.join("\n") ? `${discovered.length} surfaces` : "NOT THE DECLARED SET"}`,
    );
  } catch (err) {
    failures.push(`coverage walk threw ${err.message}`);
    console.log("  self-test coverage walk: UNEXPECTED FAILURE");
  }

  // The deprecated set and the enum map cannot drift apart.
  for (const [enumName, identifier] of LAMBDA_RUNTIME_ENUMS) {
    const major = /^nodejs(\d+)/.exec(identifier);
    if (major === null) continue;
    if (Number(major[1]) >= 22) continue;
    if (!DEPRECATED_LAMBDA_RUNTIMES.includes(identifier)) {
      failures.push(
        `enum ${enumName} names ${identifier}, which is below nodejs22.x, but the identifier is ` +
          `not in DEPRECATED_LAMBDA_RUNTIMES`,
      );
    }
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "facetheory-lambda-runtimes-"));
  try {
    for (const scenario of [...CLASSIFIER_CASES, ...FAIL_CLOSED_CASES]) {
      classifierCases += 1;
      const file = writeSyntheticSurface(tempDir, scenario);
      let outcome;
      try {
        outcome = scanSurface(file);
      } catch (err) {
        if (scenario.expectFailureReason === undefined) {
          failures.push(`synthetic surface ${scenario.name} threw ${err.message}`);
          console.log(`  self-test synthetic ${scenario.name}: UNEXPECTED FAILURE`);
          continue;
        }
        if (!(err instanceof GateFailure) || !err.message.includes(scenario.expectFailureReason)) {
          failures.push(
            `synthetic surface ${scenario.name} must fail closed with ` +
              `${JSON.stringify(scenario.expectFailureReason)}, got ${err.name}: ${err.message}`,
          );
          console.log(`  self-test synthetic ${scenario.name}: FAIL CLOSED FOR THE WRONG REASON`);
          continue;
        }
        console.log(
          `  self-test synthetic ${scenario.name}: FAIL CLOSED (${scenario.expectFailureReason})`,
        );
        continue;
      }
      if (scenario.expectFailureReason !== undefined) {
        failures.push(
          `synthetic surface ${scenario.name} must fail closed with ` +
            `${JSON.stringify(scenario.expectFailureReason)}, got ${JSON.stringify(selfTestViolationKinds(outcome))}`,
        );
        console.log(`  self-test synthetic ${scenario.name}: PASSED OPEN`);
        continue;
      }
      const expected = scenario.expected;
      const actual = selfTestViolationKinds(outcome);
      const matched = actual.length === expected.length && actual.every((value, i) => value === expected[i]);
      if (!matched) {
        failures.push(
          `synthetic surface ${scenario.name} expected violations ${JSON.stringify(expected)}, ` +
            `got ${JSON.stringify(actual)}`,
        );
      }
      console.log(
        `  self-test synthetic ${scenario.name}: ${actual.length === 0 ? "PASS" : `FAIL ${actual.join("; ")}`}`,
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const missingSurface = path.join(tempDir, "absent", "surface.ts");
  classifierCases += 1;
  try {
    scanSurface(missingSurface);
    failures.push("a missing scanned surface must fail closed, but the scan succeeded");
    console.log("  self-test missing surface: PASSED OPEN");
  } catch (err) {
    if (!(err instanceof GateFailure) || !err.message.includes("could not read scanned surface")) {
      failures.push(`missing scanned surface threw ${err.name}: ${err.message}`);
      console.log("  self-test missing surface: FAIL CLOSED FOR THE WRONG REASON");
    } else {
      console.log("  self-test missing surface: FAIL CLOSED (could not read scanned surface)");
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  self-test: ${failure}`);
    throw new GateFailure(
      `self-test failed (${failures.length} failures across ${classifierCases} synthetic surfaces ` +
        `plus ${scopeCases} scope cases)`,
    );
  }

  return { classifierCases, scopeCases };
}

// === entry point ===========================================================

function main() {
  const args = process.argv.slice(2);
  const unsupported = args.filter((arg) => arg !== "--self-test");
  if (unsupported.length > 0) {
    fail(`unsupported arguments ${unsupported.join(" ")} (this gate takes no arguments)`);
  }
  const selfTest = args.includes("--self-test");
  // The self-test walks the real coverage scope, so a failure here is a gate
  // failure like any other and must report as a FAIL line rather than a stack
  // trace: an undeclared surface is exactly what it is meant to catch.
  let selfTestCounts = null;
  if (selfTest) {
    try {
      selfTestCounts = runSelfTest();
    } catch (err) {
      if (err instanceof GateFailure) fail(err.message);
      throw err;
    }
  }

  if (!selfTest) {
    // The coverage walk is what makes an unmodelled surface fail closed; it runs
    // on every real scan, not only under --self-test.
    const discovered = collectDeclarationSurfaces();
    const expected = [...SCANNED_SURFACES].sort();
    const undeclared = discovered.filter((label) => !SCANNED_SURFACES.includes(label));
    if (undeclared.length > 0) {
      fail(
        `unmodelled surface(s) declare a Lambda runtime but are not judged: ` +
          `${undeclared.join(", ")}; add each to SCANNED_SURFACES in ` +
          `scripts/check-lambda-runtime-deprecations.mjs - surfaces are never skipped`,
      );
    }
    for (const label of expected) {
      if (!discovered.includes(label)) {
        fail(`declared surface ${label} declares no modelled Lambda runtime`);
      }
    }
  }

  let outcomes;
  try {
    outcomes = SCANNED_SURFACES.map((label) => scanSurface(label));
  } catch (err) {
    if (err instanceof GateFailure) fail(err.message);
    throw err;
  }

  const violations = outcomes.flatMap((outcome) => outcome.violations);
  const declarationCount = outcomes.reduce((total, outcome) => total + outcome.declarationCount, 0);

  for (const outcome of outcomes) {
    console.log(`  ${outcome.label} declares ${outcome.declarationCount} Lambda runtime(s)`);
  }

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`lambda-runtime-deprecations: ${describeViolation(violation)}`);
    }
    fail(
      `${violations.length} Lambda runtime declaration(s) are deprecated or unmodelled ` +
        `(${declarationCount} declarations across ${outcomes.length} surfaces)`,
    );
  }

  const selfTestSummary = selfTestCounts
    ? `self-test ${selfTestCounts.classifierCases} synthetic surfaces + ${selfTestCounts.scopeCases} scope cases; `
    : "";
  console.log(
    `lambda-runtime-deprecations: PASS (${selfTestSummary}surfaces ${outcomes.length}; ` +
      `declarations ${declarationCount}; deprecated set ${DEPRECATED_LAMBDA_RUNTIMES.length}; ` +
      `supported ${SUPPORTED_LAMBDA_RUNTIMES.join(", ")})`,
  );
}

main();
