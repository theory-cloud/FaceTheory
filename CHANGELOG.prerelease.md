# Changelog

## [4.0.1-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.0...v4.0.1-rc) (2026-07-08)


### Bug Fixes

* **deps:** update upstream release pins ([79faf94](https://github.com/theory-cloud/FaceTheory/commit/79faf94d66ed423ad268807968d55a26df2e0914))

## [4.0.0-rc](https://github.com/theory-cloud/FaceTheory/compare/v3.8.1...v4.0.0-rc) (2026-07-08)


### ⚠ BREAKING CHANGES

* **isr:** Consumers that intentionally passed varyCookies: [] must either omit varyCookies to keep the all-cookies fail-safe or provide at least one cookie name in the allowlist.
* The v4 root-barrel curation removes the old router.js re-exports Router, RouterOptions, RouteMatch, RoutePatternConflict, normalizeTrailingSlashPolicy, stripNonRootTrailingSlashes, canonicalizePathForTrailingSlashPolicy, redirectPathForTrailingSlashPolicy, and routePatternConflict; these were internal routing primitives and consumers should use FaceModule routes through createFaceApp() instead. The removed request-normalization helpers are normalizePath, trimLeadingSlashes, trimTrailingSlashes, trimOuterSlashes, canonicalizeHeaders, parseQueryString, cloneQuery, parseCookiesFromHeaders, and cloneCookies. prepareUIIntegrations was also reachable from the old root barrel but is internal-only adapter-pipeline plumbing, not a consumer package API.
* **app:** mode 'isr' Faces without revalidateSeconds now throw during createFaceApp(); add revalidateSeconds or change the Face to mode 'ssr' for per-request rendering.
* **head:** Removed the exported FaceTheory Headers type alias; import FaceHeaders for FaceTheory request and response header maps. The browser Headers class is unchanged and should be imported/used from the DOM runtime when needed.
* **core:** Removed root-barrel exports for optional SPA helpers (DEFAULT_FACE_VIEW_SELECTOR, FACE_NAVIGATION_CLASSIFIER_SOURCE, FaceNavigationSnapshot, SnapshotFaceDocumentOptions, ParseFaceNavigationSnapshotOptions, FetchFaceNavigationSnapshotOptions, LoadFaceNavigationHydrationDataOptions, ApplyFaceNavigationSnapshotOptions, FaceNavigationBootstrapContext, FaceNavigationBootstrapModule, LoadFaceNavigationModuleOptions, ValidateFaceNavigationSnapshotOptions, StartFaceNavigationOptions, ClassifyFaceNavigationAnchorClickOptions, FaceNavigationAnchorClick, FaceNavigationController, readFaceHydrationData, readFaceHydrationDataUrl, snapshotFaceDocument, parseFaceNavigationSnapshot, fetchFaceNavigationSnapshot, loadFaceNavigationHydrationData, applyFaceNavigationSnapshot, loadFaceNavigationModule, validateFaceNavigationSnapshot, startFaceNavigation, classifyFaceNavigationAnchorClick, shouldHandleAnchorClick, findFaceNavigationAnchor); import them from @theory-cloud/facetheory/spa.
* **svelte:** Svelte 4 is no longer supported. The svelte peer range is now >=5.55.7 (was >=4 <5.46.0 || >=5.55.7). Svelte consumers must upgrade to svelte@^5.55.7 and author components with Svelte 5 runes. The createSvelteFace .render() synchronous input is unchanged.

### Features

* **app:** enforce face contract validation at construction ([7e220c9](https://github.com/theory-cloud/FaceTheory/commit/7e220c97b76e8bd96e42ef281b68cc6f2e8731aa))
* **client:** opt-in hydration-failure beacon ([8185806](https://github.com/theory-cloud/FaceTheory/commit/8185806d16aa7043045edcf430a94afefc023ba0))
* **cli:** facetheory create starter scaffold ([6787765](https://github.com/theory-cloud/FaceTheory/commit/6787765cf9b0084607272486c7880cbe94a6391e))
* **cli:** facetheory doctor environment checks ([57741bc](https://github.com/theory-cloud/FaceTheory/commit/57741bc8f26a9b43ba405ecba0806b92618b80ae))
* **core:** curated public export surface ([7e31e8a](https://github.com/theory-cloud/FaceTheory/commit/7e31e8a41a82e7476bb0fa1a9578f2ec202e8d52))
* **core:** shared adapter render pipeline primitive ([5777c4d](https://github.com/theory-cloud/FaceTheory/commit/5777c4d8358c37999a771410504a1bd8ffdd8329))
* **head:** authoring helpers with strict-CSP JSON-LD support ([56f3815](https://github.com/theory-cloud/FaceTheory/commit/56f3815da8994fc0b17818615e8c4b4bfc69f720))
* **head:** remove legacy head channels and dedupe keyless tags ([45af135](https://github.com/theory-cloud/FaceTheory/commit/45af13500d382a88d24e4d7263c2a86c2054df19))
* **isr:** configurable tenant boundary header list ([48d0fd4](https://github.com/theory-cloud/FaceTheory/commit/48d0fd4f3ed041abc6e9385576e186904feba28a))
* **isr:** cookie allowlist for request-variant cache keys ([a4b44b4](https://github.com/theory-cloud/FaceTheory/commit/a4b44b47e6e8214f4f08aa2df558e0c706bd6ca2))
* **isr:** on-demand invalidate on the meta-store interface ([063daae](https://github.com/theory-cloud/FaceTheory/commit/063daaea68bca968338f6a1766958c0c45c04207))
* **ops:** ISR efficiency and stream-error metrics ([50420ec](https://github.com/theory-cloud/FaceTheory/commit/50420ecfbbc4a4a6f0b7a5c23e12aa4ecbd438fd))
* **ops:** onError hook and error-class metric tag ([ac3bcc1](https://github.com/theory-cloud/FaceTheory/commit/ac3bcc1bb0899f0169686defea134b9347f96071))
* **platform:** support Node 20+ ([57f5609](https://github.com/theory-cloud/FaceTheory/commit/57f5609db04e8004d02a0ac3efae402d2ac6e6ce))
* **router:** configurable trailing-slash policy ([0fa553b](https://github.com/theory-cloud/FaceTheory/commit/0fa553b4696756633c85f1adb36e5783c598726e))
* **security:** extensible strict CSP directive composition ([2f4beff](https://github.com/theory-cloud/FaceTheory/commit/2f4beff86c84189a5ac552ca49c576e4110d64e1))
* **ssg:** bounded concurrency and per-route error isolation ([f119472](https://github.com/theory-cloud/FaceTheory/commit/f119472da8fe1e01e043515c232257c3d88c7e9a))
* **ssg:** content-hash incremental builds ([caf49b7](https://github.com/theory-cloud/FaceTheory/commit/caf49b75aa302e6f39db4febeac65ec7c3758d93))
* **stitch:** shared hosted-auth core contract ([c0936dc](https://github.com/theory-cloud/FaceTheory/commit/c0936dcf2a49b2486c768cbc2ef1f9dba247e523))
* **svelte:** require svelte &gt;=5.55.7 and modernize adapter internals ([4349501](https://github.com/theory-cloud/FaceTheory/commit/43495015ddbdaf3150cea0e5092da506b5015216))
* **testing:** consumer testing subpath with hydration assertions ([0848fec](https://github.com/theory-cloud/FaceTheory/commit/0848fec7733cd487120737e37de1aa1e1fc46169))
* **types:** FaceHeaders alias; deprecate Headers export ([307f115](https://github.com/theory-cloud/FaceTheory/commit/307f115c986e19d4a5131cadce3e62c74fa395ad))
* **types:** generic FaceModule data flow and defineFace helper ([a1d0186](https://github.com/theory-cloud/FaceTheory/commit/a1d0186b6054ba6f3fa845e61772d0c6d9868baa))
* **vite:** middleware-mode dev server with HMR ([6f5108e](https://github.com/theory-cloud/FaceTheory/commit/6f5108ebe618bcd677fcca1731c4dd219868c23d))
* **vue:** add streaming SSR ([b385f26](https://github.com/theory-cloud/FaceTheory/commit/b385f264100e9bced2f72522586ea21f2cd40d20))


### Bug Fixes

* **app:** validate face mode and contract at construction ([7cef722](https://github.com/theory-cloud/FaceTheory/commit/7cef722e0740872e3f3b6e82f316c25c1c1bc54e))
* **cli:** hydrate generated Svelte starter on body ([4a087af](https://github.com/theory-cloud/FaceTheory/commit/4a087af9e66348ce05baf2e95dac1eb1622ad861))
* **control-plane:** report strict section validation errors ([e23fdf1](https://github.com/theory-cloud/FaceTheory/commit/e23fdf1fa5845bafbefd2374d8f22011c684320d))
* **deps:** update AppTheory and TableTheory pins ([aa79eca](https://github.com/theory-cloud/FaceTheory/commit/aa79eca8f463b9f6cfc357055a89432a107068f0))
* **examples:** gate README and public subpath coverage ([0ffe112](https://github.com/theory-cloud/FaceTheory/commit/0ffe112125bbfe691aa41b3c5ca7ae6f9d8dc809))
* **examples:** import the published package surface and typecheck all examples ([b6324bc](https://github.com/theory-cloud/FaceTheory/commit/b6324bcc2c293083204f22b76ca7cc3b843c9373))
* **format:** parse docs sources in format gate ([ca837c4](https://github.com/theory-cloud/FaceTheory/commit/ca837c4d9ecf67743ea93d025706645d836029e5))
* **head:** keep JSON-LD helpers adapter-safe ([04271f8](https://github.com/theory-cloud/FaceTheory/commit/04271f870a24fe51c2fe20284e7613a4a7fe53a5))
* **head:** treat title template replacements literally ([a2f49d2](https://github.com/theory-cloud/FaceTheory/commit/a2f49d257a300be5c8004aed14b8fa37735c9b13))
* **infra:** converge SSG/ISR reference stack on AppTheorySsrSite ([0c35b6c](https://github.com/theory-cloud/FaceTheory/commit/0c35b6c58b2ea739d9f3350385395564a56afc05))
* **infra:** keep SSG ISR reference stack typecheckable ([5a483db](https://github.com/theory-cloud/FaceTheory/commit/5a483db662fa1839873f8bcc0ad3b40c69107d7d))
* **infra:** render the SSR reference stack through a real FaceApp ([5940470](https://github.com/theory-cloud/FaceTheory/commit/59404702481a426311c564ec98a54a6d4b0895af))
* **isr:** preserve status and content type on cache hits ([7d8a13e](https://github.com/theory-cloud/FaceTheory/commit/7d8a13e71df18b65e98feb2dc62b173e594bd7fa))
* **isr:** reject empty varyCookies allowlists ([20f2c74](https://github.com/theory-cloud/FaceTheory/commit/20f2c74fbceacba81f7c7beab2139ba382878b73))
* **isr:** reject malformed option shapes ([9b94390](https://github.com/theory-cloud/FaceTheory/commit/9b94390051ad6737cf77c83b76739be729173965))
* **isr:** serve stale when the metadata store fails ([311cb07](https://github.com/theory-cloud/FaceTheory/commit/311cb07ce1ed5a433c1a76ce00af673a27cd2114))
* **lambda-url:** honor writable backpressure while streaming ([befbd7d](https://github.com/theory-cloud/FaceTheory/commit/befbd7d78c92168daa2c6ebde45ff1d4919e9108))
* **ops:** harden failure visibility fallbacks ([a7a0667](https://github.com/theory-cloud/FaceTheory/commit/a7a06677d46e0b1d38e5dd76ee236a50e9525b35))
* **package:** enable tree-shaking and document packaging posture ([d2f2d66](https://github.com/theory-cloud/FaceTheory/commit/d2f2d66ecae1dd01bf3e1c1ac9eea77f829dac9a))
* **security:** address CodeQL scan findings ([b3307db](https://github.com/theory-cloud/FaceTheory/commit/b3307dbef551d0c823442e44596f3995c54b59f3))
* **security:** retire stale CodeQL anchors ([a104ffc](https://github.com/theory-cloud/FaceTheory/commit/a104ffc983dd7394c08841871e1da81a8ec50d3e))
* **security:** scope cdk audit exception to pinned peer ([0e26428](https://github.com/theory-cloud/FaceTheory/commit/0e26428805b8758e66f445b027e346ffad51b176))
* **ssg:** propagate CLI failure exit codes ([74b3ba0](https://github.com/theory-cloud/FaceTheory/commit/74b3ba0f734b7fc6745ba54d866b0d4abde4e2b4))
* **test:** accept prerelease create tarballs ([5e0aab0](https://github.com/theory-cloud/FaceTheory/commit/5e0aab001daa97a0a2ad4587053a57ec9d1a4f98))
* **test:** discover nested unit tests ([d81983e](https://github.com/theory-cloud/FaceTheory/commit/d81983e37919bb81e8314ce42aad49bd586f8464))
* **test:** discover unit tests by glob so no suite is orphaned ([db09b95](https://github.com/theory-cloud/FaceTheory/commit/db09b9554c2cd13909a6f6cb23ba03633bdcb446))
* **test:** remove stale SSG path binding ([48e799e](https://github.com/theory-cloud/FaceTheory/commit/48e799e2712a7e73094f31180b21a64cbfcbbb45))
* **vue:** wait for streaming style contributions ([9e61974](https://github.com/theory-cloud/FaceTheory/commit/9e61974ade997a58921dad22b437c6e4ddc93926))


### Documentation

* correct v4 breaking-change inventory ([08f7c09](https://github.com/theory-cloud/FaceTheory/commit/08f7c09b90c3701e294da262e53bb668cee0ba3b))
