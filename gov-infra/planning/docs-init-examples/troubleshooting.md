# FaceTheory Troubleshooting

This example document is the target shape for `docs/troubleshooting.md`.

## Quick Diagnosis

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| `npm ci` or scripts fail with engine/version errors | Node.js version is below required baseline | `ts/package.json` (`engines.node: >=24`) |
| SSG CLI exits with argument error | Required flags are missing (`--entry`, `--out`) or invalid | `ts/src/ssg-cli.ts` usage and argument parsing |
| ISR responses behave inconsistently or keys look duplicated | `S3HtmlStore.keyPrefix` and ISR `htmlPointerPrefix` were both set to same non-empty prefix | `docs/AWS_DEPLOYMENT_SHAPE.md` prefix note |
| SSR responses look cached at edge when they should be dynamic | CloudFront/cache headers are not aligned with SSR guidance | `docs/AWS_DEPLOYMENT_SHAPE.md`, `docs/OPERATIONS.md` |

## Common Issues

### Issue: Node/toolchain mismatch during local setup

**Symptoms:**
- `npm ci` fails or warns on engine constraints
- local scripts fail unexpectedly before tests run

**Cause:**
- The module expects Node.js `>=24`.

**Solution:**

```bash
node --version
# if needed, switch to a supported version
# example with nvm:
# nvm install 24
# nvm use 24

cd ts
npm ci
npm run typecheck
npm test
```

**Verification:**
- `npm run typecheck` passes.
- `npm test` executes unit suites successfully.

---

### Issue: `npm run ssg` exits with usage errors

**Symptoms:**
- Error: `both --entry and --out are required`
- Error: `invalid value for --trailing-slash`

**Cause:**
- SSG CLI input flags do not match the supported contract.

**Solution:**

```bash
cd ts
npm run ssg -- --entry ./examples/ssg-basic/faces.ts --out ./tmp-ssg --trailing-slash always
```

**Verification:**
- Command prints `SSG complete: ...` and writes output files into `./tmp-ssg`.

---

### Issue: ISR object keys are duplicated with `prefix/prefix/...`

**Symptoms:**
- ISR reads/writes miss expected objects
- S3 keys show duplicated path segments

**Cause:**
- Both physical key prefix (`S3HtmlStore`) and logical pointer prefix (`htmlPointerPrefix`) were set to the same value.

**Solution:**
- Keep only one non-empty prefix source, or configure distinct values intentionally.
- Re-run a known ISR route and inspect generated keys.

**Verification:**

```bash
# deployed environment example
curl -I https://<cloudfront-domain>/isr-demo
# expect x-facetheory-isr header and stable repeat behavior
```

## Getting Help

- Add newly recurring incidents to this file with a verified fix and verification command.
- If behavior is unclear, document `TODO:` rather than guessing unsupported runtime contracts.
