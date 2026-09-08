# Near-term glucose forecast: source evidence and implementation guidance

Researched 2026-09-07. This note distinguishes upstream behavior from proposed ShaniDms behavior. It is a monitoring feature; these findings do not validate an insulin-dosing algorithm.

Source snapshots: Nightscout `92d0834219aa771b5837dbcbf1baeb839a200cf6`; NightscoutKit `4ec9fd12a16b5d6c2de4f11870511361d42e1b7f`. Links below use upstream branches for convenient reading.

## Nightscout AR2

Nightscout's own AR2 forecast uses recent glucose, without insulin or carbohydrate inputs. Initialize `previous = ln(glucoseFiveMinutesAgo / 140)` and `current = ln(glucoseNow / 140)`. At each five-minute step, calculate `next = -0.723 * previous + 1.716 * current`, then advance the two states. Output `round(140 * exp(next))`, bounded to 36–400 mg/dL. The standard forecast creates six points through +30 minutes. Its separate displayed cone uses fixed widening factors through +65 minutes; those factors are not a patient-calibrated probability. The source gates the initial current glucose at 36 mg/dL and requires a numeric five-minute-prior estimate. Alerts separately suppress readings older than ten minutes. [Nightscout AR2 source](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/plugins/ar2.js)

**ShaniDms recommendation:** name this source `Nightscout AR2`; disclose when calculated locally. Resample/validate the five-minute-prior input rather than treating an arbitrary previous reading as exactly five minutes old. Keep any application freshness and gap rules explicit. The upstream plotting offsets of two/four seconds are visual separation, not clinical prediction intervals.

## Imported Loop forecast

Loop combines modeled insulin and carbohydrate effects with recent glucose momentum and retrospective correction. Momentum is blended rather than simply added. The prediction normally updates every five minutes. Insulin effects use therapy settings; carbohydrate absorption adapts using observed glucose changes. Loop already adjusts for recent discrepancies between modeled and observed glucose. [Loop algorithm description](https://loopkit.github.io/loopdocs/operation/algorithm/prediction/)

Loop's plotted curve describes the scenario before further automated action. Later insulin delivery or new food can change the observed outcome. This matters when interpreting forecast error. [Loop display documentation](https://github.com/LoopKit/loopdocs/blob/main/docs/loop-3/displays-v3.md)

Use the forecast uploaded by the connected Loop instance. Do not label an approximate local insulin/carbohydrate formula `Loop`. Do not add another IOB/COB correction to an imported Loop curve: those effects are already represented.

### Nightscout payload contract

Nightscout exposes device-status records at `GET /api/v1/devicestatus/` with `find` and `count` query parameters. Its generic schema does not fully specify Loop internals; the uploader models are the better reference. [Nightscout API definition](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/server/swagger.yaml)

| JSON path | Meaning |
| --- | --- |
| `created_at` | Timestamp of outer device-status record. |
| `loop.timestamp` | Timestamp of Loop status/calculation. |
| `loop.name`, `loop.version` | Upstream producer identification. |
| `loop.failureReason` | Optional Loop failure description. |
| `loop.predicted.startDate` | Absolute timestamp for prediction index zero. |
| `loop.predicted.values` | Ordered glucose predictions, in mg/dL. |
| `loop.iob.timestamp`, `loop.iob.iob` | Timestamped active insulin, in U; negative net IOB is valid. |
| `loop.iob.basaliob` | Optional basal component of IOB. |
| `loop.cob.timestamp`, `loop.cob.cob` | Timestamped remaining carbohydrates, in grams. |

The outer timestamp mapping comes from [DeviceStatus](https://github.com/LoopKit/NightscoutKit/blob/main/Sources/NightscoutKit/Models/DeviceStatus.swift). Loop fields are optional as defined by [LoopStatus](https://github.com/LoopKit/NightscoutKit/blob/main/Sources/NightscoutKit/Models/LoopStatus.swift). Active amounts and their timestamps are defined by [IOBStatus](https://github.com/LoopKit/NightscoutKit/blob/main/Sources/NightscoutKit/Models/IOBStatus.swift) and [COBStatus](https://github.com/LoopKit/NightscoutKit/blob/main/Sources/NightscoutKit/Models/COBStatus.swift); insulin units are also displayed as U by the [Nightscout Loop plugin](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/plugins/loop.js).

For index `i`, the Nightscout Loop renderer uses `startDate + i * 5 minutes`. The first value is not automatically +5 minutes, and the last value is eventual glucose, not necessarily +30 minutes. Preserve absolute times, then interpolate the desired target if it is inside the returned range. [Loop renderer](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/plugins/loop.js)

Optional uppercase arrays `loop.predicted.IOB` and `loop.predicted.COB` are glucose-effect prediction arrays in mg/dL. They are **not** insulin units or carb grams. The payload contains no confidence percentage. [PredictedBG uploader model](https://github.com/LoopKit/NightscoutKit/blob/main/Sources/NightscoutKit/Models/PredictedBG.swift)

`loop.forecastError.velocity` is mg/dL/second and `measurementDuration` is seconds. Neither is a probability or confidence percentage. [ForecastError uploader model](https://github.com/LoopKit/NightscoutKit/blob/main/Sources/NightscoutKit/Models/ForecastError.swift)

**ShaniDms recommendation:** validate numbers without converting missing/null fields to zero; retain legitimate negative IOB. Sort/select forecasts by their own timestamp rather than trusting response order. Check CGM, prediction, IOB, and COB freshness separately. Preserve unavailable/expired states in the Android widget. LoopDocs notes that Nightscout's separate carb pill can lag Loop and can show zero after upload interruption; the source-tagged Loop data is preferable. [Loop Nightscout overview](https://loopkit.github.io/loopdocs/nightscout/overview/)

## Personalization and uncertainty

The following are ShaniDms design recommendations, not claims that the upstream projects implement these features:

- Start with the same Data Subject's earlier examples: glucose level, recent slope/acceleration, variation, source age, IOB/COB with provenance, recent meal/bolus timing, and time-of-day/day-of-week in the subject's timezone.
- Use known journal context such as meals, exercise, illness, sleep, or recurring kindergarten/school schedules only when it actually exists. Distinguish recorded context from inferred routine. Never fabricate missing activity or meal entries.
- Use seasonal or age features only when there is enough relevant historical variation to evaluate them. A nearly constant age in a short history cannot teach an age effect. School holidays and changes in routine can be more informative than a bare month number. Avoid fixed demographic correction multipliers without validation.
- Fit only with examples whose inputs and outcomes were already available at each training cutoff. Keep fitting and evaluation periods separate and chronological. Do not let a future treatment, retrospectively edited context, the forecast's own outcome, or current profile settings leak into an old prediction.
- Compare +5/+15/+30-minute predictions against persistence and AR2 baselines. Score each horizon and each actual model separately. A personalized blend needs its own evaluation; borrowing AR2's hit rate would misstate its performance. Glucose-forecast benchmark research highlights the importance of reproducible comparison. [GlucoBench](https://arxiv.org/abs/2410.05780)
- Define any percentage: for example, `82% of 150 earlier +30-minute forecasts were within ±20 mg/dL`. This is an observed historical hit rate, not the probability this particular value will be correct. Mark small or unrepresentative samples as insufficient; explain the selected error tolerance.
- Prediction bands should come from held-out residuals at the same horizon and should be checked for observed coverage over time. Adjacent glucose observations are dependent; standard independent-sample conformal guarantees cannot simply be assumed. Sequential conformal research addresses that dependency under specific assumptions. [Xu and Xie, ICML 2023](https://proceedings.mlr.press/v202/xu23r.html)
- Keep source-data quality separate from empirical accuracy. More IOB/COB information does not automatically imply a higher probability. No source or adequate evaluation should mean `unavailable`/`learning`, not an invented percentage.

For graph and widget, expose the selected horizon, source, generation/readout age, forecast value, and uncertainty status. Show imported Loop and Nightscout AR2 as distinct series; show the personal series only when it exists. A shaded range and a defined historical percentage answer different questions and should be labeled accordingly.
