# Pilot release safety

The default release exposes measured Nightscout data, journals, charts and retrospective analysis. It does not expose AI advice for now or an impending meal, or any experimental future glucose curves. Retrospective AI is still not clinically validated and must not be used to make treatment or dosing decisions.

## Build declaration

`SHANI_RELEASE_CHANNEL` accepts `pilot`, `production` or `development`. The build tooling substitutes the immutable `__SHANI_RELEASE_CHANNEL__` constant in JavaScript. Android also receives `BuildConfig.SHANI_EXPERIMENTAL_FEATURES_ENABLED`. Omission defaults to `pilot`. Unknown settings are rejected by the build tooling; an absent or unknown JavaScript constant still fails closed.

Only an explicitly configured `development` build enables the retained experimental implementations. Downloaded runtime configuration, preferences, account data and navigation parameters cannot enable them. Development builds are for internal testing. They must not be distributed to pilot participants.

Web builds stamp the same compiled channel into `.shani-release.json`. The deployment script requires a valid pilot or production artifact manifest before authentication, network requests or writes. Changing the publishing shell's environment cannot make a prebuilt development artifact publishable. The hidden manifest is omitted from upload and offline precaching.

## Enforced boundaries

- The shared recommendation runtime rejects current and meal requests before reading evidence or transmitting to an AI provider. Deep links, legacy missions, retries, resumed sessions and feedback revisions use that boundary.
- The recommendation orchestrator independently rejects those requests. Allowed weekly, monthly and focused analyses use retrospective-only instructions, including for follow-up messages, and retain the existing treatment/dose output check.
- Saved current/meal transcripts and legacy transcripts without explicit retrospective request metadata are hidden. Retained legacy engine messages and meal-image actions are hidden too. The older Home current recommendation path cannot generate, save or show its previous answers.
- The forecast loader rejects direct calls before Nightscout reads, cache returns and publication. History warming and in-flight completion recheck the policy. Chart hooks stop forecast loading and polling. Chart and card renderers independently strip retained forecast props.
- Legacy Loop prediction headers and Android projection payloads omit future values. Measured glucose, trends, IOB/COB and recorded history remain available.
- Android background generation, forecast writes and widget reads enforce the native build flag. Reading or writing widget state in a restricted build removes retained experimental forecast/projection preferences, including after an upgrade before foreground JavaScript starts. The forecast row and curve legend are hidden.

## Validation

Unit tests cover default/invalid declarations, current and meal provider bypasses, saved routes/history, late evidence and forecasts, retained widget projections, bilingual pilot controls and both native and browser adapters. Existing experimental feature tests explicitly opt into the development declaration.

Run the focused suites:

```powershell
npx jest __tests__/modules/releaseSafety/policy.test.ts __tests__/aiRecommendations/recommendationOrchestrator.test.ts __tests__/modules/glucoseForecast/loader.test.ts __tests__/product/ai/recommendationRuntime.test.tsx __tests__/product/ai/AiAnalystModuleView.test.tsx __tests__/product/ai/legacyAiRuntimeAdapter.test.tsx __tests__/platform/web/useBrowserAiAnalystRuntime.test.tsx __tests__/product/dayGraph/GlucoseForecast.test.tsx __tests__/androidGlucoseLiveSurface.test.ts __tests__/aiHomeRecommendationStore.workspaceIsolation.test.ts --runInBand --silent
```

The checks establish application behavior, not clinical validation. Physical-device installation, upgrade, offline, reboot and screen-off alert verification are separate release checks. For the widget upgrade case, install a development build, create a forecast snapshot, then upgrade to the pilot build without clearing storage. Check the launcher widget before opening the app: measured history should remain and future projections/curves should be absent.
