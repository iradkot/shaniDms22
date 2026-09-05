# Runtime plugin platform policy for ShaniDms

Status: research and product recommendation  
Policy review date: 2026-08-29  
Scope: iOS App Store, Android distributed through Google Play, and the web application.  
This is engineering and product guidance, not legal or regulatory advice. Store policies can change and must be rechecked before release.

## Executive conclusion

ShaniDms should not build a universal runtime code-plugin system.

The safe cross-platform abstraction is a **signed, typed extension manifest** that selects and configures capabilities already shipped and reviewed in the host application. A narrowly bounded declarative UI package can be added later, but it must not become a general programming language or a route around store review.

Compiled or executable features must use the platform's normal trusted delivery path:

- **iOS:** ship executable code in the reviewed app build. Apple-hosted asset systems deliver content, not executable modules.
- **Android:** ship code in the base app or in a signed Play Feature Delivery module that was part of the Android App Bundle submitted to Google Play.
- **Web:** first-party ES modules or Wasm may be deployed dynamically, but they must be versioned, origin-restricted, integrity-protected where possible, and governed by the same capability broker as native.

Third-party executable plugins should be out of scope for V1. If they are ever added, web-only execution in an isolated origin and sandboxed `iframe` is the least risky starting point. A plugin must never receive a Nightscout API key, Firebase credential, LLM key, raw local database access, or an unrestricted bridge to native APIs.

## The five mechanisms are materially different

| Mechanism                                      | iOS App Store                                                                                                                                                                                                             | Android / Google Play                                                                                                                                                                     | Web                                                                                      | ShaniDms recommendation                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1. Typed manifest enables code already shipped | Generally viable. Must not conceal dormant or undocumented functionality from review.                                                                                                                                     | Viable. It is configuration, not a self-update.                                                                                                                                           | Viable.                                                                                  | **Use in V1.**                                       |
| 2. Store-delivered signed feature module       | No general executable equivalent. Apple asset delivery is for assets/content, not code.                                                                                                                                   | Supported through Play Feature Delivery and Android App Bundles.                                                                                                                          | No store analogue; use normal versioned deployment and lazy chunks.                      | **Android optimization only.**                       |
| 3. Remote declarative UI or logic              | Conditional. Safe only while genuinely declarative; material unreviewed functionality can trigger review issues or the rule 4.7 regime.                                                                                   | Generally viable as data, provided it does not become an alternative executable updater or enable policy violations.                                                                      | Viable.                                                                                  | **First-party, narrow DSL only.**                    |
| 4. Remote executable JS, Wasm, or native code  | Native code is prohibited. Remote JS may fit rule 4.7 only if the app is deliberately operated as a mini-app/plugin host and satisfies all additional rules. Wasm is executable code and should not be assumed permitted. | Downloaded DEX, JAR, and `.so` outside Google Play are prohibited. Runtime interpreted code is not categorically prohibited, but the host remains responsible for every policy violation. | Technically supported through modules and Wasm. Browser support is not a trust decision. | **Do not use on native; first-party web code only.** |
| 5. Third-party plugins                         | Possible only under the demanding 4.7 host model; very high health-data and review risk.                                                                                                                                  | Play-bundled third-party code is possible; remote interpreted code remains the host's responsibility.                                                                                     | Technically possible with isolation.                                                     | **Not in V1. Future web sandbox only.**              |

The store policies judge behavior, not the name used in the architecture. Calling downloaded logic a “manifest,” “bundle,” “workflow,” or “plugin” does not make executable behavior declarative.

## Apple policy findings

### Executable code and feature flags

[App Review Guideline 2.5.2](https://developer.apple.com/app-store/review/guidelines/) says apps should be self-contained and may not download, install, or execute code that introduces or changes app features or functionality. Its limited educational-code exception does not apply to ShaniDms.

This makes remotely replacing a React Native bundle, downloading native libraries, or downloading a general-purpose script/Wasm package to change ShaniDms functionality a high rejection risk.

A remote typed manifest is materially safer because the implementation is already in the reviewed binary. It still has a review constraint: [Guideline 2.3.1](https://developer.apple.com/app-store/review/guidelines/) prohibits hidden, dormant, or undocumented features and requires new features and product changes to be specifically described and made accessible to App Review. Therefore:

- remote flags may control rollout, ordering, availability, or emergency disablement of reviewed functionality;
- they should not reveal a materially new health feature that Apple could not inspect in the submitted build; and
- review notes should explain the manifest system, provide a fully enabled review account, and identify significant remotely controlled capabilities.

### Rule 4.7 is a host regime, not a general hot-update exemption

[Guideline 4.7](https://developer.apple.com/app-store/review/guidelines/) allows certain software not embedded in the binary, including HTML5 and JavaScript mini apps, chatbots, and plug-ins. The host is responsible for all of that software and all applicable law. Rules 4.7.1–4.7.5 additionally require:

- compliance with privacy rules, including sensitive health-data rules;
- objectionable-content filtering, reporting, and blocking mechanisms;
- compliance with Apple's digital-goods payment rules;
- no extension or exposure of native platform APIs without prior Apple permission;
- explicit user consent before sharing data or privacy permissions with each offered software instance;
- an index and metadata for all offered software, including universal links; and
- age identification and restriction where offered software exceeds the host app's rating.

For a medical-data application, these obligations make a third-party iOS plugin marketplace disproportionately risky. ShaniDms should not rely on 4.7 as a way to ship ordinary product updates. If this direction is ever reconsidered, it needs explicit App Review positioning, legal review, a content-review operation, per-plugin privacy disclosures, and an Apple-compatible data-consent flow.

### Apple-hosted assets are not executable feature modules

Apple's [On-Demand Resources guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/On_Demand_Resources_Guide/index.html) states that on-demand resources can contain bundle-supported resource types except executable code. The newer [Background Assets framework](https://developer.apple.com/documentation/BackgroundAssets) is likewise described as a mechanism for additional assets and says it should be used only for downloading app assets.

These systems can deliver images, help content, models used by already shipped code, translations, or declarative packages. They are not an iOS equivalent of Android dynamic feature modules.

### Health and medical review raises the threshold

[Guideline 1.4.1](https://developer.apple.com/app-store/review/guidelines/) states that medical apps capable of inaccurate information or diagnosis/treatment receive greater scrutiny. Accuracy claims must disclose supporting data and methodology, and users should be reminded to consult a doctor before making medical decisions.

Apple's privacy rules are directly relevant to plugins:

- [Guidelines 5.1.1 and 5.1.2](https://developer.apple.com/app-store/review/guidelines/) require disclosure, consent, data minimization, security, retention/deletion information, and explicit permission before sharing personal data with third parties, including third-party AI.
- Guideline 5.1.1(ix) says healthcare apps or apps requiring sensitive information should be submitted by the legal entity providing the service rather than an individual developer.
- [Guideline 5.1.3](https://developer.apple.com/app-store/review/guidelines/) treats health, fitness, and medical data as especially sensitive. It prohibits advertising, marketing, or use-based data mining, except permitted health-management or research uses with permission; it also prohibits writing false or inaccurate health data.

These duties apply to health data in context, not only to future HealthKit integration. A plugin cannot become a separate, undisclosed data controller merely because it runs inside ShaniDms.

## Google Play policy findings

### Dynamic code loading

Google Play's [Device and Network Abuse policy](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en) says a Play-distributed app may not modify, replace, or update itself outside Google Play. It also prohibits downloading executable DEX, JAR, or `.so` code from sources other than Google Play.

The policy has an important but limited distinction: code running in a virtual machine or interpreter with indirect access to Android APIs, such as JavaScript in a WebView, is not categorically covered by that binary-code prohibition. However, runtime-loaded interpreted code such as JavaScript, Python, or Lua must not enable potential Google Play policy violations.

Google's [SDK Requirements](https://support.google.com/googleplay/android-developer/answer/13323374) give concrete risk examples, including an SDK that downloads DEX or native code outside Play and a WebView JavaScript interface that loads untrusted or unverified URLs. Google also makes the app developer responsible for third-party code and its user-data practices.

Consequences for ShaniDms:

- never download DEX, JAR, `.so`, APK, or compiled React Native native modules from Firebase/CDN;
- do not treat the interpreted-code exception as permission for an unreviewed plugin marketplace;
- never expose a broad React Native or WebView bridge to remote code; and
- verify every runtime URL and payload even when the source is first-party.

### Play Feature Delivery is the approved compiled-code path

Official [Play Feature Delivery](https://developer.android.com/guide/playcore/feature-delivery) documentation supports install-time, conditional, and on-demand dynamic feature modules. The modules are included in the Android App Bundle. Signing configuration comes from the base module, and module version code/name come from the base app. Google Play generates and serves the appropriate signed APK splits.

The [on-demand delivery guide](https://developer.android.com/guide/playcore/feature-delivery/on-demand) confirms that an installed base app can later request a feature module containing code and resources from Google Play. It also cautions against exported Android components in optional modules and recommends a base interface for code implemented in a feature module.

This is a delivery optimization, not an independently versioned plugin ecosystem:

- the module must be built and reviewed as part of the app bundle;
- its version follows the base app version;
- adding or changing its code requires a new Play release; and
- the base app needs explicit unavailable/downloading/installed/error states.

For a React Native product, Play Feature Delivery also creates Android-only build and navigation complexity. It should be reserved for a genuinely large, infrequently used capability, not used as the default architecture for ordinary ShaniDms Modules.

### Health-data obligations

Google Play's [Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en) requires health apps to complete the Health apps declaration, publish an accessible privacy policy, disclose collection/use/sharing of personal and sensitive data, request only necessary permissions, and avoid misleading or potentially harmful health functionality. Regulated medical-device functionality requires proof of approval; other health apps need the stated non-medical-device disclaimer and a reminder to consult a healthcare professional.

If ShaniDms later integrates Health Connect, the [Health Connect permissions policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en) adds approved-use-case, explicit-consent, minimum-scope, security, transparency, and deletion requirements. It treats Health Connect data as personal and sensitive and restricts secondary, advertising, data-broker, and other disallowed uses.

Runtime plugins do not receive a separate policy allowance. ShaniDms remains responsible for plugin behavior, disclosures, permissions, and health claims.

## Web platform findings

The web has no app-store code-review gate equivalent. Dynamic executable delivery is a normal platform capability, so security and governance must be created by ShaniDms.

### ES modules

The [HTML Living Standard](https://html.spec.whatwg.org/dev/scripting.html) defines module scripts and their fetch behavior. Module scripts use the CORS protocol for cross-origin fetching, and `import()` can load a module graph dynamically. This makes lazy first-party feature loading practical on the web.

Origin permission is not publisher trust. A server that is permitted by CORS or `script-src` can still serve malicious or accidentally changed code.

### CSP and Wasm

[Content Security Policy Level 3](https://www.w3.org/TR/CSP/) lets the application restrict script sources, inline execution, string evaluation, and Wasm compilation. `unsafe-eval` permits string-to-code mechanisms and Wasm; the narrower `wasm-unsafe-eval` permits Wasm compilation without enabling JavaScript `eval()`.

ShaniDms should keep `unsafe-eval` disabled. If first-party Wasm is required, `wasm-unsafe-eval` should be enabled only in the smallest possible origin or document, not as a blanket relaxation for the whole application.

The [WebAssembly Core Specification](https://webassembly.github.io/spec/core/) states that Wasm has no ambient access to the environment; it can interact only through imports supplied by the embedder. This is useful for a capability model, but it does not make arbitrary Wasm trustworthy. The embedder remains responsible for imports, resource limits, and side-channel isolation.

### Integrity and isolation

[Subresource Integrity](https://www.w3.org/TR/SRI/) allows a browser to verify a cryptographic hash before executing supported script/link resources and reject a response that does not match. SRI protects against unexpected content replacement; it does not establish that the publisher is trustworthy, that the code is safe, or that the requested capabilities are appropriate.

For genuinely third-party web software, the [HTML `iframe` sandbox model](https://html.spec.whatwg.org/multipage/iframe-embed-object.html) can disable scripts, forms, top navigation, downloads, popups, and same-origin access unless individual tokens restore them. The standard warns that combining `allow-scripts` and `allow-same-origin` for same-origin content can let the embedded page escape the sandbox, and recommends serving potentially hostile content from a separate dedicated domain.

Therefore, a future web plugin must run on a separate origin, in a sandboxed frame, and communicate only through a narrow validated message protocol. A Worker is useful for performance isolation but is not an adequate security boundary for code that shares the application's origin and capabilities.

## Recommended ShaniDms trust model

### Trust tier 0: reviewed host code

This is the only tier allowed to:

- access Nightscout credentials or authenticated clients;
- read local/Firebase persistence directly;
- create an AI provider client using a saved LLM key;
- display system permission prompts;
- change clinical algorithms or thresholds; or
- invoke native platform APIs.

Tier 0 includes code in the iOS build, Android base app, Play-delivered signed feature modules, and first-party web deployment.

### Trust tier 1: signed activation manifest

Recommended for V1. The manifest may:

- enable or disable an implementation already shipped;
- select a stable Product Destination Registry ID;
- control Module order, copy variants, rollout cohort, and platform availability;
- select from pre-shipped layouts and visualization options; and
- disable a faulty capability through a kill switch.

It may not include code, expressions, arbitrary URLs, SQL, GraphQL documents supplied by the manifest, unbounded templates, or new medical formulas. Every identifier resolves through an allowlist compiled into the host.

### Trust tier 2: first-party declarative package

Consider only after the manifest model is proven. Its language should be intentionally non-Turing-complete and limited to:

- a fixed set of layout nodes;
- fixed data fields returned by a host query catalogue;
- formatting and localization keys;
- bounded filters and comparisons;
- navigation to registered destinations; and
- requests for host-owned actions that always enforce their own confirmation rules.

Clinical interpretation, dose calculations, therapy-setting proposals, alert safety rules, and AI tool selection should remain versioned host code. A “formula” or “script expression” field would cross the line into executable logic.

### Trust tier 3: executable extension

Not supported cross-platform in V1.

- Android may use a Play Feature Delivery module compiled into the submitted App Bundle.
- Web may lazy-load a first-party, immutable ES module/Wasm asset from the ShaniDms deployment.
- iOS receives the same feature only in a reviewed app build.

The shared manifest can advertise the same logical extension ID, but the executable delivery mechanism must differ by platform.

### Trust tier 4: third-party plugin

Disabled in V1. A future experiment should begin on web only, with:

- publisher onboarding and legal agreement;
- human security and clinical review of every version;
- separate-origin sandboxed execution;
- no direct network access except an explicitly approved origin, preferably none;
- no secrets or storage handles;
- an explicit per-Workspace grant for each data capability;
- an obvious publisher/version label; and
- immediate server and client revocation.

Shipping the same third-party runtime on iOS would require deliberate compliance with Apple's rule 4.7 host model. It should not be assumed to pass review merely because the web version exists.

## Capability and data-permission model

Extensions should receive values, never credentials or unrestricted object references. Suggested capability families:

| Capability                                     | Default              | Notes                                                                                                   |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `glucose.summary.read`                         | Denied               | Prefer aggregates and selected range over raw CGM records.                                              |
| `glucose.raw.read`                             | Denied and high-risk | Separate explicit consent; strict time and row limits.                                                  |
| `journal.meals.read` / `journal.activity.read` | Denied               | App-Owned Data is private to the Product User and Workspace.                                            |
| `journal.entry.propose`                        | Denied               | Host displays and confirms before writing.                                                              |
| `reminder.propose`                             | Denied               | Creates no Reminder without Product User approval.                                                      |
| `destination.open`                             | Allowlisted          | Only registered stable destination IDs and validated Contextual Entries.                                |
| `ai.request`                                   | Denied and high-risk | Host chooses provider, redacts data, and obtains required disclosure/consent. Never reveal the LLM key. |
| `network.fetch`                                | Denied               | If ever enabled, exact HTTPS origins, methods, size, timeout, and response schema are declared.         |
| `therapy.settings.write`                       | Never available      | ShaniDms is advisory and does not apply therapy changes.                                                |

Additional invariants:

- A grant belongs to one Product User, one Workspace, one plugin ID, one publisher, one major version, and named capabilities.
- Relationship to Data Subject does not silently grant plugin access.
- An AI conversation or AI Specialist remains bound to exactly one Workspace.
- Permission is requested at the moment a visible feature needs it, with the data type, purpose, publisher, retention, and destination shown.
- Revocation takes effect locally immediately and is synced afterward.
- Each broker call records plugin ID/version, Workspace, capability, record count or range, result, and timestamp without duplicating raw health data into telemetry.
- Plugin output is untrusted content. It is escaped, size-limited, and cannot inject routes, HTML, Markdown with active content, or notification actions.

On iOS, a 4.7 implementation would additionally need explicit consent for data or privacy permission sharing with each offered software instance. On Google Play, the same capability model supports minimum-scope, prominent-disclosure, consent, and third-party-code obligations.

## Manifest envelope

The shared manifest should describe trust and compatibility, not executable behavior:

```json
{
  "schemaVersion": 1,
  "extensionId": "shani.trends.agp",
  "publisherId": "shani.first-party",
  "version": "1.4.0",
  "kind": "activation",
  "hostApiRange": ">=1.3 <2",
  "minAppVersion": {
    "ios": "3.2.0",
    "android": "3.2.0",
    "web": "2026.08.29"
  },
  "implementationId": "trends.agp",
  "platforms": ["ios", "android", "web"],
  "requestedCapabilities": ["glucose.summary.read", "destination.open"],
  "healthRisk": "informational",
  "issuedAt": "2026-08-29T00:00:00Z",
  "expiresAt": "2026-11-29T00:00:00Z",
  "payloadSha256": "...",
  "signingKeyId": "extensions-2026-01",
  "signature": "..."
}
```

Required validation before activation:

1. Known schema and extension ID.
2. Trusted publisher and signing key.
3. Valid signature over a canonical representation.
4. Payload hash match.
5. Host interface and app-version compatibility.
6. Platform implementation exists and is allowlisted.
7. Requested capabilities are valid for the declared extension kind and health-risk class.
8. Package is not expired, revoked, or below the minimum accepted version.
9. Resource-count, nesting, string, image, query, CPU, and memory budgets pass.
10. Required Product User grants exist for the active Workspace.

TLS is still mandatory, but TLS and Firebase authentication do not replace payload signatures. A signature verifies provenance and integrity; it does not replace store review, clinical review, or user consent.

## Versioning, rollout, and rollback

### Common rules

- Store manifest schema, host-interface version, extension version, publisher key ID, payload hash, and clinical-algorithm version separately.
- Download into a staging area, verify completely, then switch the active pointer atomically.
- Retain the active and last-known-good packages.
- Run a bounded startup/self-check before marking a version healthy.
- Support a signed kill switch and publisher/key revocation list.
- Use deterministic, auditable rollout cohorts. Do not expose an unreviewed iOS feature only after review completes.
- Prevent silent downgrade below a locally recorded minimum version. An emergency rollback must itself be signed and explicitly authorized.
- Data migrations must be forward/backward compatible. Declarative packages may not run arbitrary migration code.
- Offline failure falls back to reviewed built-in functionality. An expired or missing manifest must not hide factual glucose access or corrupt cached data.

### Platform-specific rollback

| Platform                     | Code version unit                                              | Fast disable                                                                    | Code rollback                                                                                      |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| iOS                          | Reviewed App Store build                                       | Signed manifest can disable an already shipped capability.                      | New/previous App Store build process; do not download replacement code.                            |
| Android base or Play feature | Base App Bundle version; dynamic feature inherits base version | Signed manifest can prevent entry and request module removal where appropriate. | Publish a corrected App Bundle. A dynamic feature is not independently versioned.                  |
| Web                          | Immutable deployment/chunk version                             | Server manifest or routing kill switch                                          | Atomically repoint to a previous immutable deployment; invalidate only the affected cache version. |
| Declarative package          | Signed extension version                                       | Revoke version and activate last-known-good                                     | Local atomic pointer rollback on all platforms.                                                    |

## What must differ by platform

The logical registry, manifest schema, capability vocabulary, consent records, audit format, and extension IDs can be shared. Delivery cannot be identical:

- `ios`: `implementationId` must resolve to code already in the reviewed binary. Remote package fields may reference assets or declarative content, never a code URL.
- `android`: it may resolve to shipped code or a known Play Feature Delivery module name included in the submitted App Bundle. It may not resolve to arbitrary downloaded DEX/native code.
- `web`: it may resolve to an immutable first-party build asset. Use same-origin loading by default, a restrictive CSP, and SRI/Integrity Policy where the resource-loading shape supports it.

Trying to force one executable package format across React Native iOS, Android, and web would select the least reviewable and least trustworthy mechanism on every platform.

## V1 decision

Build only these pieces:

1. An in-process Product Destination Registry containing all executable Modules and internal destinations.
2. A signed typed manifest that can enable, order, label, and disable known registry IDs.
3. A capability broker even though V1 extensions are first-party; this prevents later code from receiving ambient health-data access.
4. Local-first manifest cache with staged verification, last-known-good fallback, expiry, revocation, and audit metadata.
5. Platform bindings that make unavailable implementations explicit.

Do not build in V1:

- remote React Native bundle replacement;
- downloaded JS/Wasm/native plugins on iOS or Android;
- a general expression evaluator;
- arbitrary HTML rendered in the main app origin or WebView bridge;
- third-party plugin upload or marketplace flows;
- direct plugin access to Nightscout, Firebase, local storage, LLM providers, notifications, or health permissions; or
- plugin-authored therapy changes, clinical thresholds, dose calculations, or automatic treatment actions.

## Primary official sources

- Apple. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), especially 1.4.1, 2.3.1, 2.5.2, 4.7–4.7.5, and 5.1–5.1.3.
- Apple. [On-Demand Resources Guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/On_Demand_Resources_Guide/index.html).
- Apple. [Background Assets](https://developer.apple.com/documentation/BackgroundAssets).
- Google Play. [Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/16559646?hl=en).
- Android Developers. [Overview of Play Feature Delivery](https://developer.android.com/guide/playcore/feature-delivery).
- Android Developers. [Configure on-demand delivery](https://developer.android.com/guide/playcore/feature-delivery/on-demand).
- Google Play. [SDK Requirements](https://support.google.com/googleplay/android-developer/answer/13323374).
- Google Play. [Health Content and Services](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en).
- Google Play. [Health Connect permissions policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en).
- WHATWG. [HTML Living Standard: scripting and module scripts](https://html.spec.whatwg.org/dev/scripting.html).
- W3C. [Content Security Policy Level 3](https://www.w3.org/TR/CSP/).
- W3C. [Subresource Integrity](https://www.w3.org/TR/SRI/).
- WebAssembly Community Group. [WebAssembly Core Specification](https://webassembly.github.io/spec/core/).
- WHATWG. [HTML Living Standard: `iframe` sandbox](https://html.spec.whatwg.org/multipage/iframe-embed-object.html).
