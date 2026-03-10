# FaceTheory Troubleshooting

Use this guide for recurring setup, build, and runtime failures that already have a verified diagnosis path.

## Quick Diagnosis

| Symptom | Likely cause | Where to look |
|---|---|---|
| `npm ci` or scripts fail early | Node.js is below the required baseline | `ts/package.json` (`engines.node: >=24`) |
| `npm run ssg` exits with usage errors | Missing or invalid CLI flags | `docs/api-reference.md` and `ts/src/ssg-cli.ts` |
| SSG build fails during page generation | Network access was attempted without opting in | `buildSsgSite()` and SSG fetch guard behavior |
| ISR object keys look duplicated | `S3HtmlStore.keyPrefix` and `htmlPointerPrefix` repeat the same prefix | `docs/core-patterns.md` and `docs/cdk/aws-deployment.md` |
| React streaming misses late styles | `styleStrategy: shell` was used where `all-ready` was needed | `docs/core-patterns.md` |

## Issue: Node.js Version Mismatch

Symptoms:
- `npm ci` warns or fails on engines
- local scripts fail before tests complete

Cause:
- FaceTheory requires Node.js `>=24`.

Solution:

```bash
node --version

# switch to a supported version, then rerun:
cd ts
npm ci
npm run typecheck
npm test
```

Verification:
- `npm run typecheck` passes
- `npm test` passes

## Issue: `npm run ssg` Fails With Argument Errors

Symptoms:
- `both --entry and --out are required`
- `invalid value for --trailing-slash`
- `unknown argument: ...`

Cause:
- The repository CLI wrapper only accepts the documented flag set.

Solution:

```bash
cd ts
npm run ssg -- --entry ./examples/ssg-basic/faces.ts --out ./tmp-ssg --trailing-slash always
```

Verification:
- The command prints `SSG complete: ...`
- Output files are written into `./tmp-ssg`

## Issue: SSG Build Fails Because `fetch()` Is Blocked

Symptoms:
- SSG route generation throws when page code tries to call the network

Cause:
- `buildSsgSite()` disables real network access by default.

Solution:
- Prefer injecting a mocked `fetch` in programmatic builds
- Or allow real network access explicitly when that is intentional:

```bash
cd ts
npm run ssg -- --entry ./examples/ssg-basic/faces.ts --out ./tmp-ssg --allow-network
```

Verification:
- The build completes without the network guard error

## Issue: ISR HTML Keys Are Duplicated

Symptoms:
- S3 object keys look like `prefix/prefix/...`
- ISR misses expected cached HTML objects

Cause:
- `S3HtmlStore.keyPrefix` and `htmlPointerPrefix` were configured with the same non-empty value.

Solution:
- Keep one prefix physical and the other logical, or leave one empty
- Re-run a known ISR route and inspect the written object keys

Verification:
- Repeated requests hit the same expected S3 object path
- Response headers show stable `x-facetheory-isr` transitions

## Issue: Streaming HTML Ships Without Expected Late Styles

Symptoms:
- HTML renders, but styles from async boundaries are missing from `<head>`

Cause:
- React streaming was finalized at `shell` instead of `all-ready`.

Solution:

```ts
renderOptions: {
  styleStrategy: 'all-ready',
}
```

Verification:
- Re-run the affected route
- Confirm the expected style tags are present in server-rendered output

## Getting Help

- Add newly repeated incidents here with a verified fix and a verification step.
- If a behavior is not formally documented yet, keep it out of the canonical troubleshooting guidance until it is confirmed.
