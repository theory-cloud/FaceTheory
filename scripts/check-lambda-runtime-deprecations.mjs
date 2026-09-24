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
// "Declares a runtime" means the same thing to the coverage walk and to the
// per-surface scan, and it covers the receiver forms a real surface uses:
// `lambda.Runtime.X`, a named import's `Runtime.X`, `lambda['Runtime'].X`, a
// renamed destructure's `const { Runtime: RT } = lambda` with `RT.X`, and
// either of the first two aliased to a local name through any number of hops
// (`const R = lambda.Runtime`, then `const R2 = R`). A surface that binds the
// namespace and then hides the member behind a computed index, a lookup table,
// or a helper declares nothing the model can read, which fails closed rather
// than passing unjudged.
//
// A quoted literal is a declaration only as the argument of `fromString` on one
// of those receivers. Scoping it that way is what keeps the rule honest in both
// directions: an unmodelled argument (`fromString('rust1.0')`, or a family with
// no version such as `fromString('provided')`) is recorded and fails closed
// instead of vanishing, while a runtime-shaped string that is not a runtime
// argument - a log message, a description, `'nodejs22.x'` beside a genuinely
// dynamic `fromString(config.runtime)` - is no longer read as a declaration
// that rescues the surface. Two consequences are deliberate rather than
// oversights: `fromString` with a non-literal argument declares nothing
// readable, and a call whose receiver is not traceable to a Runtime binding
// (a bare `fromString('nodejs18.x')` in a helper) is not read either. Both leave
// the surface without the declaration that would otherwise be judged, so they
// end in the same fail-closed rule as an obfuscated surface.
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
// is not modelled, including a `fromString` argument that resolves to no runtime
// at all; a declaration that names an unpinned moving alias rather than a pinned
// runtime; and any file inside SCAN_ROOTS that declares a Lambda runtime without
// being a declared surface.
//
// A coverage walk that cannot run is a gate failure in its own right, and it
// reports as this gate's FAIL line rather than as an uncaught stack trace: a
// missing scan root means the scope was never checked, which is the one outcome
// this gate must never present as a passing scan.
//
// The scope is owned by this checker and there is no allowlist, no waiver flag,
// and no exception list. EXPECTED_SCANNED_SURFACES and EXPECTED_SCAN_ROOTS are
// independent copies of the scope, so the self-test fails when either is
// narrowed. `--self-test` is the only argument, and it runs the classifier
// self-test plus synthetic surfaces driven through the real read path before
// the real scan.
import { spawnSync } from "node:child_process";
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
//
// The receiver is read in five forms, because requiring the literal text
// `lambda.Runtime.` left the others declaring nothing at all:
//
//   lambda.Runtime.NODEJS_20_X   a `lambda` namespace import's member
//   Runtime.NODEJS_20_X          a named import: `import { Runtime } from ...`
//   lambda['Runtime'].NODEJS_20_X
//                                 that member read through a quoted index
//   R.NODEJS_20_X                 any of the above aliased to a local name:
//                                 `const R = lambda.Runtime`,
//                                 `import { Runtime as R } from ...`,
//                                 `const { Runtime: R } = lambda`, or a second
//                                 hop, `const R2 = R` where `R` is an alias
//   R.fromString('nodejs20.x')    a runtime literal passed to the enum factory
//
// A new undeclared surface written in any of those idioms was invisible to the
// classifier and to the coverage walk alike, so it passed the gate without ever
// being judged. The receiver list is therefore built per surface: the fixed
// receivers plus whatever names that surface binds.
//
// What stays outside the model, deliberately and now by measurement rather than
// by omission: a member read through a computed key (`R[process.env.NAME]`), a
// runtime hidden behind a lookup table or a helper, a `['Runtime']` read bound
// to a local name and used later, an enum member read as `R['NODEJS_20_X']`, and
// a bare `fromString('nodejs20.x')` on no receiver. None of them yields a
// declaration, so a surface written that way fails closed on the "declares no
// modelled Lambda runtime" rule instead of passing unjudged.
const RUNTIME_NAMESPACE_RECEIVERS = ["lambda\\.Runtime", "Runtime"];

// Names a surface binds to the Runtime enum (`R` beside `R.NODEJS_20_X`) or to
// the aws-lambda namespace itself (`L` beside `L['Runtime'].NODEJS_20_X`). A
// binding is never a declaration: an enum member still has to follow it. A
// surface that binds the namespace and then hides the member ends up with no
// readable declaration, which is the fail-closed outcome this gate wants rather
// than a reason to widen further.
//
// Each form carries the same lookahead, and that lookahead is what keeps a hop a
// hop: `const R2 = R` is an alias of the receiver, while `const V = R.NODEJS_20_X`
// and `const R = lambda.Runtime['NODEJS_20_X']` bind a runtime value and must not
// be chased into a receiver.
const BINDING_NOT_FOLLOWED_BY_A_MEMBER = String.raw`(?![\s]*[.[])`;
const RUNTIME_RECEIVER_BINDING_RES = [
  // const R = lambda.Runtime   /   let R = Runtime
  new RegExp(
    String.raw`\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:lambda\.Runtime|Runtime)\b${BINDING_NOT_FOLLOWED_BY_A_MEMBER}`,
    "g",
  ),
  // import { Runtime as R } from 'aws-cdk-lib/aws-lambda'
  /\bimport\s*\{[^}]*?\bRuntime\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)[^}]*?\}\s*from\s*["'][^"']*aws-lambda["']/g,
  // const { Runtime: R } = lambda
  /\b(?:const|let|var)\s*\{[^}]*?\bRuntime\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)[^}]*?\}\s*=/g,
];

const RUNTIME_NAMESPACE_BINDING_RES = [
  // import * as lambda from 'aws-cdk-lib/aws-lambda'
  /\bimport\s+\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s*["'][^"']*aws-lambda["']/g,
];

// `const R2 = R`: one binding of another. Chased to a fixed point, so an alias of
// an alias is still a receiver.
const RUNTIME_BINDING_HOP_RE = new RegExp(
  String.raw`\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\b${BINDING_NOT_FOLLOWED_BY_A_MEMBER}`,
  "g",
);

// The receiver alternation for one surface: every `['Runtime']` index form of a
// namespace binding, the two fixed receivers, then every local name bound to the
// enum. `lambda` is in the namespace set unconditionally, because the fixed
// receiver list already reads its `lambda.Runtime` member as text rather than as
// something to resolve through an import.
function runtimeReceiverAlternation(text) {
  const receivers = new Set();
  for (const pattern of RUNTIME_RECEIVER_BINDING_RES) {
    for (const match of text.matchAll(pattern)) receivers.add(match[1]);
  }
  const namespaces = new Set(["lambda"]);
  for (const pattern of RUNTIME_NAMESPACE_BINDING_RES) {
    for (const match of text.matchAll(pattern)) namespaces.add(match[1]);
  }
  for (;;) {
    let changed = false;
    for (const match of text.matchAll(RUNTIME_BINDING_HOP_RE)) {
      const [target, source] = [match[1], match[2]];
      if (receivers.has(source) && !receivers.has(target)) {
        receivers.add(target);
        changed = true;
      } else if (namespaces.has(source) && !namespaces.has(target)) {
        namespaces.add(target);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const indexForms = [...namespaces]
    .sort()
    .map((name) => `${escapeRegExp(name)}\\s*\\[\\s*["']Runtime["']\\s*\\]`);
  return [
    ...indexForms,
    ...RUNTIME_NAMESPACE_RECEIVERS,
    ...[...receivers].sort().map(escapeRegExp),
  ].join("|");
}

// Every runtime enum this gate models is SCREAMING_CASE, and that is what keeps
// the widened receiver list from swallowing unrelated `Runtime.` namespaces:
// Node's inspector domain spells its members `Runtime.ScriptId` and
// `Runtime.StackTrace`, which do not match. The quoted-index form is equally
// narrow: it only matches a literal `'Runtime'` key, and `inspector` is not a
// namespace binding, so `inspector['Runtime']` stays outside the model. The two
// non-Lambda runtime strings this repository synthesizes (`cloudfront-js-2.0`
// for CloudFront Functions and CDK's `python3.13` custom-resource provider) are
// quoted literals, and the literal rule reads them only as arguments of
// `Runtime.fromString`; both live in the excluded snapshots.
const ENUM_MEMBER_NAME = "([A-Z][A-Z0-9_]*)";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The enum-member pattern for one surface.
function enumDeclarationPattern(text) {
  return new RegExp(`\\b(${runtimeReceiverAlternation(text)})\\.${ENUM_MEMBER_NAME}\\b`, "g");
}

// The runtime-literal pattern for one surface: the argument of `fromString` on a
// receiver that surface binds. The value pattern is deliberately loose - the
// predicate below decides - so an unfamiliar runtime family still reaches the
// classifier instead of being invisible. The receiver is what keeps the rule
// scoped: without it, this repository's own
// `s3deploy.CacheControl.fromString('public,max-age=0')` would be read as a
// Lambda declaration.
function literalDeclarationPattern(text) {
  return new RegExp(
    `\\b(${runtimeReceiverAlternation(text)})\\.fromString\\s*\\(\\s*["'\`]([^"'\`]+)["'\`]`,
    "g",
  );
}

// The identifier a `fromString` argument names, or null when the argument is not
// runtime-shaped. A modelled runtime identifier is a known family followed by a
// version component, so `nodejs20.x` and `provided.al2023` resolve while
// `node_modules`, `assets`, and `go.mod` do not - and neither does a family this
// gate does not model (`rust1.0`), nor a family with no version at all
// (`provided`). Returning null for those is what makes them fail closed rather
// than disappear.
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
// { line, form, identifier, enumName, literal }. `identifier` is null when the
// form could not be resolved to a modelled runtime, and that is a declaration
// all the same: it is what makes an unmodelled name fail closed instead of
// dropping out of the count. `enumName` is null for literal forms and `literal`
// is null for enum forms. `form` is the receiver and member exactly as written,
// so a violation reports the idiom the surface actually used rather than the one
// the gate prefers.
function collectDeclarations(text) {
  const declarations = [];
  for (const match of text.matchAll(enumDeclarationPattern(text))) {
    const receiver = match[1];
    const enumName = match[2];
    declarations.push({
      index: match.index,
      line: lineOf(text, match.index),
      form: `${receiver}.${enumName}`,
      enumName,
      literal: null,
      identifier: LAMBDA_RUNTIME_ENUMS.get(enumName) ?? null,
    });
  }
  for (const match of text.matchAll(literalDeclarationPattern(text))) {
    const literal = match[2];
    declarations.push({
      index: match.index,
      line: lineOf(text, match.index),
      form: `${match[1]}.fromString("${literal}")`,
      enumName: null,
      literal,
      identifier: runtimeIdentifierFromLiteral(literal),
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
    // Two ways to be unreadable, and both fail closed on their own reason: an
    // enum name this gate has no mapping for, and a `fromString` argument that
    // resolves to no modelled runtime at all. The second is the one an
    // unmodelled family used to escape through, so it is named as a literal
    // rather than reported as an enum with a null name.
    if (declaration.literal !== null) {
      return {
        kind: "unmodelled-literal",
        line: declaration.line,
        form: declaration.form,
        detail:
          `passes '${declaration.literal}' to fromString, which resolves to no runtime this gate ` +
          `models: its family is not in LAMBDA_RUNTIME_FAMILIES, or it carries no version; ` +
          `${UNMODELLED_DECLARATION_HINT}`,
      };
    }
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
  // The receiver forms a named import and a local alias introduce. Before the
  // widened receiver prefix each of these surfaces declared nothing, so a file
  // written this way escaped both the classifier and the coverage walk.
  {
    name: "deprecated-runtime-through-a-named-import",
    text: "import { Runtime } from 'aws-cdk-lib/aws-lambda';\n\nnew NodejsFunction(this, 'SsrFunction', {\n  runtime: Runtime.NODEJS_20_X,\n});\n",
    expected: ["deprecated"],
  },
  {
    name: "supported-runtime-through-a-named-import",
    text: "import { Runtime } from 'aws-cdk-lib/aws-lambda';\nruntime: Runtime.NODEJS_24_X,\n",
    expected: [],
  },
  {
    name: "deprecated-runtime-through-an-aliased-namespace",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nconst R = lambda.Runtime;\nruntime: R.NODEJS_20_X,\n",
    expected: ["deprecated"],
  },
  {
    name: "supported-runtime-through-an-aliased-namespace",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nconst R = lambda.Runtime;\nruntime: R.NODEJS_24_X,\n",
    expected: [],
  },
  {
    name: "deprecated-runtime-through-a-renamed-named-import",
    text: "import { Runtime as R } from 'aws-cdk-lib/aws-lambda';\nruntime: R.NODEJS_18_X,\n",
    expected: ["deprecated"],
  },
  // A surface that was declared and then switched idiom is still caught: the
  // scaffold template below is one half of a real scanned surface.
  {
    name: "scaffold-template-switching-to-a-named-import",
    text: "export const INFRA_STACK = `\nimport { Runtime } from 'aws-cdk-lib/aws-lambda';\n  runtime: Runtime.NODEJS_20_X,\n`;\n",
    expected: ["deprecated"],
  },
  // An unmodelled `fromString` argument must be a declaration that fails closed.
  // Before the literal rule was scoped to `fromString` on a Runtime receiver
  // these two surfaces declared nothing at all: the argument resolved to no
  // runtime and was dropped, so an unmodelled runtime was invisible rather than
  // judged.
  {
    name: "unmodelled-family-literal",
    text: "runtime: lambda.Runtime.fromString('rust1.0'),\n",
    expected: ["unmodelled-literal"],
  },
  {
    name: "runtime-literal-without-a-version",
    text: "runtime: lambda.Runtime.fromString('provided'),\n",
    expected: ["unmodelled-literal"],
  },
  // The other direction: a runtime-shaped string that is not a `fromString`
  // argument is not a declaration, so it cannot be judged in place of a dynamic
  // runtime. Before the fix this surface was reported as declaring the stray
  // literal, which is a false violation the surface never wrote.
  {
    name: "stray-runtime-literal-is-not-a-declaration",
    text:
      "runtime: lambda.Runtime.fromString(config.runtime),\n" +
      "const releaseNote = 'nodejs18.x';\n" +
      "runtime: lambda.Runtime.NODEJS_24_X,\n",
    expected: [],
  },
  // The receiver idioms the enum rule now reads. Each of these declared nothing
  // before, in the classifier and in the coverage walk alike, so a surface
  // written this way passed the gate without ever being judged.
  {
    name: "deprecated-runtime-through-a-second-hop-alias",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nconst R = lambda.Runtime;\nconst R2 = R;\nruntime: R2.NODEJS_20_X,\n",
    expected: ["deprecated"],
  },
  {
    name: "supported-runtime-through-a-second-hop-alias",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nconst R = lambda.Runtime;\nconst R2 = R;\nruntime: R2.NODEJS_24_X,\n",
    expected: [],
  },
  {
    name: "deprecated-runtime-through-a-quoted-index",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nruntime: lambda['Runtime'].NODEJS_20_X,\n",
    expected: ["deprecated"],
  },
  {
    name: "supported-runtime-through-a-quoted-index",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nruntime: lambda['Runtime'].NODEJS_24_X,\n",
    expected: [],
  },
  {
    name: "deprecated-runtime-through-a-renamed-destructure",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nconst { Runtime: RT } = lambda;\nruntime: RT.NODEJS_20_X,\n",
    expected: ["deprecated"],
  },
  {
    name: "supported-runtime-through-a-renamed-destructure",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nconst { Runtime: RT } = lambda;\nruntime: RT.NODEJS_24_X,\n",
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
  // Binding the namespace and then hiding the member is not a way to declare
  // nothing and still pass: the surface has no readable declaration, so it fails
  // closed on the same rule that catches an obfuscated surface.
  {
    name: "named-import-with-an-unreadable-member",
    text: "import { Runtime } from 'aws-cdk-lib/aws-lambda';\nruntime: Runtime[legacyRuntimeName],\n",
    expectFailureReason: "declares no modelled Lambda runtime",
  },
  {
    name: "aliased-namespace-with-an-unreadable-member",
    text: "import * as lambda from 'aws-cdk-lib/aws-lambda';\nconst R = lambda.Runtime;\nruntime: R[process.env.FACETHEORY_RUNTIME],\n",
    expectFailureReason: "declares no modelled Lambda runtime",
  },
  // D1, the false-declaration direction. A dynamic `fromString` declares nothing
  // readable, and an unrelated runtime-shaped string must not stand in for it.
  // Before the literal rule was scoped, the stray literal WAS the declaration, so
  // this surface was judged as declaring a supported runtime and passed.
  {
    name: "dynamic-fromString-rescued-by-a-stray-runtime-literal",
    text: "runtime: lambda.Runtime.fromString(config.runtime),\nconst releaseNote = 'nodejs22.x';\n",
    expectFailureReason: "declares no modelled Lambda runtime",
  },
  // Lock-in for the same rule rather than a pin of the defect: a non-literal
  // argument was already not a declaration before the fix. It is here so that a
  // future rule which read bare quoted strings again could not reintroduce the
  // rescue above without turning this case red.
  {
    name: "dynamic-fromString-with-no-literal-at-all",
    text: "runtime: lambda.Runtime.fromString(config.runtime),\n",
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

  // The entry-point error boundary is in main(), so it can only be pinned by
  // running the entry point. This probe copies the checker into a scratch
  // repository whose second scan root is absent, runs the bare path there, and
  // asserts the child reported this gate's own FAIL line: a coverage walk that
  // cannot run must never present itself as a passing scan, and an uncaught
  // GateFailure stack trace is not that FAIL line.
  const entryPointProbes = 1;
  try {
    const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "facetheory-lambda-entry-point-"));
    try {
      const scratchScripts = path.join(scratchRoot, "scripts");
      fs.mkdirSync(scratchScripts, { recursive: true });
      fs.copyFileSync(
        fileURLToPath(import.meta.url),
        path.join(scratchScripts, "check-lambda-runtime-deprecations.mjs"),
      );
      // The first scan root exists and is empty, so the walk reaches the absent
      // root instead of stopping at the first one.
      fs.mkdirSync(path.join(scratchRoot, SCAN_ROOTS[0]));
      const probe = spawnSync(
        process.execPath,
        [path.join(scratchScripts, "check-lambda-runtime-deprecations.mjs")],
        { encoding: "utf8" },
      );
      const output = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
      const reportedMissingRoot =
        /lambda-runtime-deprecations: FAIL \(scan root \S+ is missing/.test(output);
      const stackFrames = /\n\s+at /.test(output);
      if (probe.status !== 1 || !reportedMissingRoot || stackFrames) {
        failures.push(
          `an entry point whose coverage walk cannot run must report the gate FAIL line with no ` +
            `stack frames; got exit ${probe.status}, FAIL line ` +
            `${reportedMissingRoot ? "present" : "absent"}, stack frames ` +
            `${stackFrames ? "present" : "absent"}: ${output.trim()}`,
        );
        console.log("  self-test entry point without a coverage scan root: NOT A GATE FAILURE");
      } else {
        console.log(
          "  self-test entry point without a coverage scan root: FAIL CLOSED (gate FAIL line, no stack frames)",
        );
      }
    } finally {
      fs.rmSync(scratchRoot, { recursive: true, force: true });
    }
  } catch (err) {
    failures.push(`entry-point probe threw ${err.name}: ${err.message}`);
    console.log("  self-test entry point without a coverage scan root: UNEXPECTED FAILURE");
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  self-test: ${failure}`);
    throw new GateFailure(
      `self-test failed (${failures.length} failures across ${classifierCases} synthetic surfaces, ` +
        `${scopeCases} scope cases, and ${entryPointProbes} entry-point probe)`,
    );
  }

  return { classifierCases, scopeCases, entryPointProbes };
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
    // on every real scan, not only under --self-test. It carries the same error
    // boundary as the surface scan below, because a walk that cannot run - a scan
    // root that is missing, an unreadable tree - is a gate failure that has to
    // report as this gate's FAIL line. Without the boundary the GateFailure
    // escaped main() and node printed an uncaught stack trace instead, which is
    // not a report any consumer of this gate can read.
    let discovered;
    try {
      discovered = collectDeclarationSurfaces();
    } catch (err) {
      if (err instanceof GateFailure) fail(err.message);
      throw err;
    }
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
    ? `self-test ${selfTestCounts.classifierCases} synthetic surfaces + ` +
      `${selfTestCounts.scopeCases} scope cases + ${selfTestCounts.entryPointProbes} entry-point probe; `
    : "";
  console.log(
    `lambda-runtime-deprecations: PASS (${selfTestSummary}surfaces ${outcomes.length}; ` +
      `declarations ${declarationCount}; deprecated set ${DEPRECATED_LAMBDA_RUNTIMES.length}; ` +
      `supported ${SUPPORTED_LAMBDA_RUNTIMES.join(", ")})`,
  );
}

main();
