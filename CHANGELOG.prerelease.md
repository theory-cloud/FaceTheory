# Changelog

## [4.1.1-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.1.0...v4.1.1-rc) (2026-09-24)


### Bug Fixes

* **create:** emit narrow allow-remote .npmrc in scaffolded apps ([9c8ff0d](https://github.com/theory-cloud/FaceTheory/commit/9c8ff0d0db9d7be36993ac6760241d1d8bc0458b))
* **create:** emit narrow allow-remote .npmrc in scaffolded apps ([aac26c7](https://github.com/theory-cloud/FaceTheory/commit/aac26c7bf0e37f5f6ba88c56527e1e2f3b36c2d7))
* **deps:** move upstream pin to AppTheory v4.4.0 ([71eccb8](https://github.com/theory-cloud/FaceTheory/commit/71eccb8e074cf0bd9bdbade77c968a5cb5eefd00))
* **deps:** move upstream pin to AppTheory v4.4.0 ([a7dc0cc](https://github.com/theory-cloud/FaceTheory/commit/a7dc0cc292b4d1cf929058d3889b419dbff851be))

## [4.1.0-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.10...v4.1.0-rc) (2026-09-24)


### Features

* **create:** scaffold new apps on the nodejs24.x Lambda runtime ([68a0c87](https://github.com/theory-cloud/FaceTheory/commit/68a0c876ad00eb506d509ba3e2786632a0501166))
* **infra:** move FaceTheory to the nodejs24.x Lambda runtime (U1-U5) ([18d4a85](https://github.com/theory-cloud/FaceTheory/commit/18d4a85bacaf9d60b6737579e4c926f72a54603e))
* **infra:** move the reference stacks to the nodejs24.x Lambda runtime ([0d718c1](https://github.com/theory-cloud/FaceTheory/commit/0d718c1d7a4effec7ac84bf8ea0a5cc28bebaa06))
* **lambda-checker:** read bracket, second-hop, and destructured runtime receivers ([172011f](https://github.com/theory-cloud/FaceTheory/commit/172011f044bda01e65b1804f65409ac8ff537e0a))
* **platform:** raise the Node floor to Node 22 ([c97c1ca](https://github.com/theory-cloud/FaceTheory/commit/c97c1ca3c3ca1fe8b2bc83a71eea6f5f2159998c))
* **scripts:** gate deprecated Lambda runtimes ([2a40875](https://github.com/theory-cloud/FaceTheory/commit/2a408758000a1237b2fab236a3b1b52a2c9fcef2))
* **scripts:** gate npm dependency engines on the Node floor ([c222884](https://github.com/theory-cloud/FaceTheory/commit/c2228843141f8d3f2c75d9046bcd1db916ffb3e8))


### Bug Fixes

* **ci:** close the named-import bypass in the Lambda-runtime gate ([4296cda](https://github.com/theory-cloud/FaceTheory/commit/4296cda7b4a3fa2180bf83e0c4777d01e8b488e7))
* **ci:** harden the engines-floor and Lambda-runtime gates ([ae77859](https://github.com/theory-cloud/FaceTheory/commit/ae77859957dab317200accc88e711b288e3524e6))
* **ci:** quote-anchor the runtime-gate surface pins ([0cd60d2](https://github.com/theory-cloud/FaceTheory/commit/0cd60d2410a62c8fa1ca0cb0d6327c165407bb59))
* **ci:** refuse concrete components after a wildcard in the engines-floor matcher ([2b66dd1](https://github.com/theory-cloud/FaceTheory/commit/2b66dd186f32dee408ebdfa1ee61c28619618137))
* **create:** align scaffold TypeScript fallback with the modern line ([032f872](https://github.com/theory-cloud/FaceTheory/commit/032f8727c3da02022889689f19b0f64bc36c3231))
* **deps:** bump docs json gem to 2.21.2 and resolve ts devalue advisory ([698a707](https://github.com/theory-cloud/FaceTheory/commit/698a7078a7b1802090500faa219a6b6bb4cc1788))
* **deps:** bump json gem to 2.21.2 in docs ([2f4137a](https://github.com/theory-cloud/FaceTheory/commit/2f4137a2a0cc4ae056ecb558ba8eada7e4b08ee5))
* **deps:** move upstream pins to AppTheory v4.3.0 and TableTheory v3.1.0 ([0533c86](https://github.com/theory-cloud/FaceTheory/commit/0533c869904eea48ed51de60dd039d3939ff8e42))
* **deps:** move upstream pins to AppTheory v4.3.0 and TableTheory v3.1.0 ([b84d498](https://github.com/theory-cloud/FaceTheory/commit/b84d498464c097f6c5583ffc767f580360e762bf))
* **deps:** pin TableTheory v3.0.7 across ts and infra ([a4a6705](https://github.com/theory-cloud/FaceTheory/commit/a4a6705d7325027552535370cc9a26c99c934d26))
* **deps:** pin TableTheory v3.0.7 across ts and infra; add Dependabot config ([971a3d6](https://github.com/theory-cloud/FaceTheory/commit/971a3d69f9f5378af8bf7a97fc4f84bcec738df9))
* **deps:** resolve devalue advisory in ts lockfile ([662c807](https://github.com/theory-cloud/FaceTheory/commit/662c807f8ded4784b992ea038861b4f1183523f7))
* **gov-infra:** remove the stale brace-expansion audit exception ([7400d2a](https://github.com/theory-cloud/FaceTheory/commit/7400d2aa1f415406c683cba8789fe7174262042f))
* **lambda-checker:** give the coverage walk an entry-point error boundary ([b87aab4](https://github.com/theory-cloud/FaceTheory/commit/b87aab45ebbe0cbc431574a3ffe5c760572dd2e8))
* **lambda-checker:** harden the Lambda runtime deprecation gate (quoted literals, entry-point boundary, receiver idioms) ([7ba82e7](https://github.com/theory-cloud/FaceTheory/commit/7ba82e72484a8f20e303b0ad5d54db11ebd0831a))
* **lambda-checker:** scope the runtime-literal rule to fromString receivers ([23209ff](https://github.com/theory-cloud/FaceTheory/commit/23209ff3bc1bac5e2dd98d1728c56b26f620b6d2))
* **scripts:** close the prerelease false pass in the engines floor gate ([1b30932](https://github.com/theory-cloud/FaceTheory/commit/1b30932457d1b0d98c81e5768880373f8cf3078e))
* **test:** deflake oac-form document replacement against async completion ([d2d00c5](https://github.com/theory-cloud/FaceTheory/commit/d2d00c5950c668e68b40cfdc1ee5135cb43296a7))
* **test:** deflake the oac-form document-replacement test ([56ba145](https://github.com/theory-cloud/FaceTheory/commit/56ba145859bec367b0b7c5a1b4ac5fd4da931adb))

## [4.0.10-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.9...v4.0.10-rc) (2026-09-03)


### Bug Fixes

* **ci:** pass repo context to pages deploy dispatch ([dec60ca](https://github.com/theory-cloud/FaceTheory/commit/dec60cacefa3d2dade538b69f343f76f8e676809))
* **ci:** pass repo context to pages deploy dispatch ([6411fb3](https://github.com/theory-cloud/FaceTheory/commit/6411fb3f57368e860f01c1b028dc971e2b6de2ed))
* **deps:** align AppTheory v4.2.3 release-asset pins ([0bf911c](https://github.com/theory-cloud/FaceTheory/commit/0bf911c0f951321f3dc9bfbf002c345f01d460b6))
* **deps:** align AppTheory v4.2.3 release-asset pins ([ae8e6a1](https://github.com/theory-cloud/FaceTheory/commit/ae8e6a170c0cefe2c0070aa1a4482fc728a84a49))
* **deps:** resolve @humanfs/node advisory in ts lockfile ([2a4a571](https://github.com/theory-cloud/FaceTheory/commit/2a4a571753e5d4bfbde049993cfd20fd58f4f442))

## [4.0.9-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.8...v4.0.9-rc) (2026-08-25)


### Bug Fixes

* **ci:** build pages deploy from the run ref, not the dispatch input ([f2443f3](https://github.com/theory-cloud/FaceTheory/commit/f2443f3835e6ce7cc5b6a40d282d0132f89dae3c))
* **ci:** install docs gems before jekyll build in pages workflow ([9efaf0a](https://github.com/theory-cloud/FaceTheory/commit/9efaf0aaabd4ad0592deb05a04036dfa2c8c9471))
* **deps:** pin AppTheory v4.1.0 ([5e05b2c](https://github.com/theory-cloud/FaceTheory/commit/5e05b2c4c9a59dd39ef0a6d22d865d55aedc92b0))
* **deps:** pin AppTheory v4.1.0 ([dbf24f9](https://github.com/theory-cloud/FaceTheory/commit/dbf24f972268eaae8e1f4c6bf218d50fc02ffbdf))
* **deps:** pin TableTheory v3.0.6 ([3e25001](https://github.com/theory-cloud/FaceTheory/commit/3e25001f2ffdaaacfb68cb71bd4afe09a16fbb16))

## [4.0.8-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.7...v4.0.8-rc) (2026-08-22)


### Bug Fixes

* **deps:** align coordinated apptheory pin set to v3.3.0 ([85618a3](https://github.com/theory-cloud/FaceTheory/commit/85618a3452c1d26f8659bec43256478b30f164f4))
* **deps:** align ts apptheory dev pin to v3.3.0 ([3bbc2cf](https://github.com/theory-cloud/FaceTheory/commit/3bbc2cfd57a10f6f2631e93490cafd826d8f9e92))
* **deps:** align ts apptheory-cdk dev pin to v3.3.0 ([30a535d](https://github.com/theory-cloud/FaceTheory/commit/30a535d80b5db2b27ca7748b6e41233c4c50ce74))
* **deps:** bump AppTheory infra pins to v3.3.0 ([40b0a38](https://github.com/theory-cloud/FaceTheory/commit/40b0a38bd285bf009bda96ceca730d35bbbfce6c))
* **deps:** bump AppTheory infra pins to v3.3.0 ([00f8840](https://github.com/theory-cloud/FaceTheory/commit/00f884015a226b8700282a1ff106ee705b544fa4))
* **navigation-pending:** classify form submits after app handlers run ([11b8d28](https://github.com/theory-cloud/FaceTheory/commit/11b8d28e915cfff52150fb011d006d78d2d99bb8)), closes [#436](https://github.com/theory-cloud/FaceTheory/issues/436)
* **navigation-pending:** match form method and target keywords exactly ([a487302](https://github.com/theory-cloud/FaceTheory/commit/a48730245c7314890ee3f1048146aeea4a8352a8))
* **navigation-pending:** skip dialog-method and non-_self form submits ([b416d47](https://github.com/theory-cloud/FaceTheory/commit/b416d47c659a07531e52052c7c420b0c7dd7600a))

## [4.0.7-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.6...v4.0.7-rc) (2026-08-20)


### Bug Fixes

* **deps:** align AppTheory and TableTheory pins ([ff50017](https://github.com/theory-cloud/FaceTheory/commit/ff50017882b85d50cea955e210b5540c9e1d8b3f))
* **deps:** align AppTheory v3.1.0 and TableTheory v3.0.5 pins ([10fc319](https://github.com/theory-cloud/FaceTheory/commit/10fc319e8de509b763779f53450a8a7b8d33b2c3))
* **deps:** bump nanoid 3.3.16 -&gt; 3.3.18 for GHSA-2v37-7h3g-55p8 ([acc7268](https://github.com/theory-cloud/FaceTheory/commit/acc7268c4285a793a1980e44fb9dbdb910d0d70c))
* **gov-infra:** block DOC-1 outside intended worktree ([9700d9c](https://github.com/theory-cloud/FaceTheory/commit/9700d9c5aae11f1df1e6fb0761a3ca974c76eb07))
* **gov-infra:** block Git checks outside repo root ([27fc1e3](https://github.com/theory-cloud/FaceTheory/commit/27fc1e335edce6b9b6d7abb8dc09148a5b10389b))
* **gov-infra:** make DOC-1 materialized-path assertions merge-order independent ([c5ee212](https://github.com/theory-cloud/FaceTheory/commit/c5ee2126e491e927d9b7b1187911a8dd0cd5b1bd))
* **gov-infra:** refresh rubric report provenance ([dd0fcd4](https://github.com/theory-cloud/FaceTheory/commit/dd0fcd41243d6417d924a46ffd8f43fa8a992e8f))
* materialization hygiene — untrack AGENTS.md, DOC-1 fidelity patch, nanoid bump ([fa47c14](https://github.com/theory-cloud/FaceTheory/commit/fa47c143f6e9912160c09fe9fd0981218e551d31))

## [4.0.6-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.5...v4.0.6-rc) (2026-08-07)


### Bug Fixes

* **deps:** align AppTheory and TableTheory pins ([9380056](https://github.com/theory-cloud/FaceTheory/commit/9380056fe9d5c5310ca98a0d2f4d1663d3dc2898))
* **deps:** align AppTheory v3.0.2 and TableTheory v3.0.4 ([a217d9f](https://github.com/theory-cloud/FaceTheory/commit/a217d9ffbd2a327fce4fa4b9822d0e8c0e7aa7d3))
* **deps:** remediate auditable dependency findings ([d1b6b54](https://github.com/theory-cloud/FaceTheory/commit/d1b6b54aadfb7b0e54b07ae910587bc5b9340450))

## [4.0.5-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.4...v4.0.5-rc) (2026-08-02)


### Bug Fixes

* **deps:** adopt AppTheory v3.0.1 ([c4eb8a8](https://github.com/theory-cloud/FaceTheory/commit/c4eb8a81ba35dcb045656bff0fc26209f7f94bd9))
* **deps:** adopt AppTheory v3.0.1 ([96b8798](https://github.com/theory-cloud/FaceTheory/commit/96b879860610ad684aa509ec92e1708c1d94a051))
* **head:** address origin derivation residual lows ([71b37cf](https://github.com/theory-cloud/FaceTheory/commit/71b37cf9a5257cf663adfcd7a769699cf4aa327e))
* **head:** flatten host fallback + symmetric trailing-dot normalization (THE-2815) ([756f1af](https://github.com/theory-cloud/FaceTheory/commit/756f1af615a2f5551c380dba685388c4b8390511))
* **head:** flatten host fallback and trailing dots (THE-2815) ([b634dc2](https://github.com/theory-cloud/FaceTheory/commit/b634dc2ca9d6cdd937a2eb8d9e2632a152a882aa))
* **head:** normalize allowed-origin trailing-dot symmetry ([a526684](https://github.com/theory-cloud/FaceTheory/commit/a5266847553cd94e4ba16e37699c7996c85610d3))
* **head:** normalizeAllowedOrigin trailing-dot symmetry + guard regression test ([4c581c1](https://github.com/theory-cloud/FaceTheory/commit/4c581c14edb51c2e59c5ef0d1afb14c345f75086))
* **head:** origin-derivation residual review lows (THE-2806) ([93318e5](https://github.com/theory-cloud/FaceTheory/commit/93318e51ce066f72d7c0e0d48ad596efd765eac8))

## [4.0.4-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.3...v4.0.4-rc) (2026-08-02)


### Bug Fixes

* **deps:** adopt AppTheory v3 pins ([63ae910](https://github.com/theory-cloud/FaceTheory/commit/63ae9103817fd38906e572c2ee3735bcddb007d2))
* **deps:** adopt AppTheory v3 pins ([a184149](https://github.com/theory-cloud/FaceTheory/commit/a184149d6cea5ab0a2bdd99652174ae91fb62bfb))
* **deps:** align SSR example and pin documentation ([803cf59](https://github.com/theory-cloud/FaceTheory/commit/803cf593c399ca84c28c619c28d74f59637c0030))
* **head:** forward request origin to head renderer ([3220625](https://github.com/theory-cloud/FaceTheory/commit/3220625fb0ef81287a87c21c669aeb995e50c41b))
* **head:** forward request origin to head renderer ([efc56a6](https://github.com/theory-cloud/FaceTheory/commit/efc56a64383ebd985757df148f02b67e46f8238a))
* **head:** trust AppTheory origin headers ([dbd742a](https://github.com/theory-cloud/FaceTheory/commit/dbd742a2e89a84bb75e73e044ee7bdc9d9f6509d))
* **test:** align doctor pin assertion ([1d5ace7](https://github.com/theory-cloud/FaceTheory/commit/1d5ace718c5be2a9bf132e11210782a903901de1))

## [4.0.3-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.2...v4.0.3-rc) (2026-07-30)


### Bug Fixes

* **deps:** update AppTheory and TableTheory pins ([6883f52](https://github.com/theory-cloud/FaceTheory/commit/6883f52004dbb6e4fa486791d5da331c4df083ea))
* **deps:** update AWS SDK clients and json ([642f3f0](https://github.com/theory-cloud/FaceTheory/commit/642f3f06634d02877f5a39de5bf9c1fdf18ae8af))
* **deps:** update AWS SDK clients and json ([2e464b1](https://github.com/theory-cloud/FaceTheory/commit/2e464b1b8d29b39e19d6fb5dee0f5341a95d656c))

## [4.0.2-rc](https://github.com/theory-cloud/FaceTheory/compare/v4.0.1...v4.0.2-rc) (2026-07-23)


### Bug Fixes

* **deps:** update AppTheory and TableTheory pins ([a1207d7](https://github.com/theory-cloud/FaceTheory/commit/a1207d77fa1691a3051f1956466450e7ff72deca))

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
