# Meal and physical-activity CGM outcomes: evidence and product guardrails

Status: product research recommendation  
Evidence reviewed: 2026-08-29  
Scope: retrospective, non-causal outcome views around ShaniDms Meal Entries and Activity Entries. This is product guidance, not medical advice, a treatment algorithm, or a dosing algorithm.

## Bottom line

The reviewed clinical standards support showing glucose before, during, and after meals or physical activity. They do **not** define a universal CGM “meal score,” “activity score,” event-analysis window, or minimum number of repeated events that proves a personal pattern.

For many nonpregnant adults, the [ADA Standards of Care in Diabetes—2026, Section 6](https://doi.org/10.2337/dc26-S006) gives a peak postprandial capillary glucose guide of `<180 mg/dL`, measured `1–2 hours after the beginning of the meal`. This is a clinical point-in-time guide. It is not a validated two-hour CGM score, a definition of a complete meal response, or a target for every Data Subject.

For exercise, the [EASD/ISPAD CGM exercise position statement](https://doi.org/10.1007/s00125-020-05263-9) separates preparation, the exercise interval, the first 90 minutes after exercise, and the nocturnal period. It also emphasizes highly variable responses and CGM lag. This supports multiple time windows, not one combined outcome number.

Therefore, ShaniDms V1 should:

- show a trace and transparent descriptive metrics, never a single meal or activity score;
- use one primary meal window plus a visibly separate delayed window;
- separate exercise into baseline, during, acute recovery, and delayed context;
- aggregate only repeated, sufficiently complete, reasonably comparable events;
- always expose sample count, data coverage, overlaps, and relevant context; and
- say `observed after`, `coincided with`, or `was associated with`, never `caused`.

## What is clinically standardized

### General CGM ranges and data sufficiency

The [2019 International Consensus on Time in Range](https://doi.org/10.2337/dci19-0028) and ADA 2026 standardize the familiar glucose bands `<54`, `54–69`, `70–180`, `181–250`, and `>250 mg/dL` for many nonpregnant people with type 1 or type 2 diabetes. ADA 2026 describes `10–14 days` with at least `70%` CGM wear as useful for retrospective assessment.

Those targets were developed for multi-day glycemic assessment. Applying goals such as `TIR >70%` to a two-hour meal window or one exercise event is **not** standardized. ShaniDms may use the standard thresholds to describe minutes in each band within an event window, but it must not present multi-day percentage targets as event pass/fail criteria.

The [2017 International Consensus on CGM](https://doi.org/10.2337/dc17-1600) and the [2023 international consensus for CGM metrics in clinical trials](<https://doi.org/10.1016/S2213-8587(22)00319-9>) support reporting mean glucose, variability, time in ranges, events, data collection period, and data completeness. Neither defines a clinical meal score or activity score.

### Postprandial glucose

ADA's `1–2 hour` recommendation is timed from the **beginning of the meal** and is generally intended to capture peak postprandial levels. It does not say that every peak occurs then. In an original CGM study of people with type 1 diabetes, mean peak time was `87 ± 29 minutes`, with significant between-person and within-person variation and low repeatability of peak time (`ICC 0.29`). See [Johansen et al., 2012](https://doi.org/10.1177/193229681200600221).

Research protocols use different analysis windows. A free-living study of adults with type 1 diabetes on hybrid closed-loop systems used early and late windows extending to four hours after breakfast and six hours after lunch and dinner, partly to capture delayed responses related to meal composition. See [Scidà et al., 2024](https://doi.org/10.1177/19322968241256475). A recent standardized-breakfast study in people with type 2 diabetes examined a four-hour response and found mean postprandial glucose, peak, and nadir more reproducible than several dynamic measures. See [Giosuè et al., 2026](https://doi.org/10.1038/s41387-026-00435-9). These are useful studies, not a universal standard.

There is no validated clinical **meal score** in the reviewed sources.

### Physical activity

ADA 2026 recommends teaching people with diabetes to monitor glucose during and after physical activity and to understand that effects can be prolonged and vary with intensity and duration. See [ADA Standards of Care in Diabetes—2026, Section 5](https://doi.org/10.2337/dc26-S005).

For type 1 diabetes, the EASD/ISPAD position statement provides more specific safety-oriented intervals:

- the exact exercise interval should be monitored, with readings or scans every 15–30 minutes when feasible;
- the first `90 minutes` after exercise is treated as an acute post-exercise period; and
- after late-afternoon, evening, intense, or prolonged exercise, nocturnal hypoglycemia often occurs `6–15 hours` later, although risk may persist longer.

The [ADA physical-activity position statement](https://doi.org/10.2337/dc16-1728) similarly reports that post-exercise hypoglycemia commonly occurs 6–15 hours later and that risk can extend to 48 hours. These are safety observations, not proof that a glucose change in that period was caused only by the activity.

CGM values also require caution during rapid change. In a small original study, median relative error increased during aerobic exercise and returned toward pre-exercise values afterward. See [Moser et al., 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5872070/). The position statement likewise discusses physiological sensor lag around exercise.

There is no standardized retrospective **activity outcome score** or one agreed before/during/after analysis window.

## Recommended V1 meal outcome

These windows are a **ShaniDms product specification**, not a clinical standard.

| Layer            | Product window                            | Purpose                                                                            |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Baseline         | `−30 to 0 minutes` from logged meal start | Establish recent glucose level and direction                                       |
| Primary response | `0 to 120 minutes`                        | Align with the common 1–2 hour clinical observation period and common research use |
| Delayed response | `120 to 240 minutes`                      | Reveal a later rise or fall without mixing it into the primary result              |

The UI should always show the full trace. The primary and delayed windows should be visually distinct. Do not silently extend a poor-quality two-hour record until a favorable or unfavorable peak is found.

### Defensible descriptive metrics

Show, when data permit:

- meal-start glucose and trend;
- change from baseline at 60 and 120 minutes;
- highest glucose and time to highest glucose;
- maximum rise above baseline;
- mean glucose in the primary window;
- lowest glucose after the peak;
- minutes in the five standard glucose bands;
- any consensus-threshold low or high occurrence and its duration;
- CGM coverage and largest gap; and
- the same limited metrics for the delayed window, clearly separated.

An incremental area under the curve from 0–2 hours (`iAUC0–2h`) is defensible as an **advanced descriptive research metric**. It is used in original postprandial studies, including [Merino et al., 2022](https://doi.org/10.1093/ajcn/nqac026). It should not be the hero metric. Its baseline rule, handling of values below baseline, units, and formula version must be visible because implementations differ.

Do not calculate GMI, CV targets, GRI, or a meal grade from a single event. Do not describe `<180 mg/dL` as a universal meal pass mark. If the ADA reference is shown, it must be attached to an explicitly confirmed target profile for the Data Subject, not inferred from the Product User's relationship to that person.

### Confounding and overlap

Keep an event in its individual history, but mark it `overlapping context` and exclude it from default pattern aggregation when the primary window contains another meal, unlinked carbohydrates, rescue treatment, physical activity, a correction, or a material data gap. Display insulin, Loop mode, starting glucose, recent activity, and other available context as observations. Their presence does not establish the reason for the outcome.

## Recommended V1 activity outcome

These windows are also **ShaniDms product choices**. They apply to a logged Activity Entry and should not be presented as a universal exercise physiology model.

| Layer           | Product window                           | Purpose                                                                     |
| --------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Baseline        | `−30 to 0 minutes` before activity start | Recent glucose and direction                                                |
| During          | recorded start through recorded end      | Describe the activity interval itself                                       |
| Acute recovery  | end through `+90 minutes`                | Match the distinct post-exercise period used by the EASD/ISPAD statement    |
| Delayed context | `+90 minutes to +15 hours`               | Surface later and nocturnal lows without merging them into the acute result |

An optional trace may continue to 24 hours. It should be called `later context`, not an activity outcome. A 24–48-hour safety note may be educational, but attributing all glucose in that span to one activity would be misleading.

Show separately for `during`, `acute recovery`, and `delayed context`:

- glucose at activity start and end;
- net change and direction;
- peak and nadir with their timing;
- median rate of change during the activity;
- minutes in the five standard bands;
- low and high occurrences with timing and duration;
- data coverage and gaps; and
- activity type, duration, intensity, time of day, recent meal, available insulin context, and AID/Loop state.

Do not combine these into one `benefit`, `safety`, or `performance` number. Aerobic, resistance, interval, mixed, and incidental activity can have different glucose responses. A comparison should match or stratify by activity type, duration band, intensity, time of day, prandial state, and therapy context when those fields are reliable.

## Repeated-event pattern rules

No reviewed guideline or validation study provides a clinical minimum count for a personal meal or activity pattern. Two repeated meals are not enough to assume stability: a controlled inpatient study in adults without diabetes found high within-person variability for duplicate meals and concluded that personalized advice needs aggregated repeated measurements. See [Hengist et al., 2025](https://doi.org/10.1016/j.ajcnut.2024.10.007). Its population differs from ShaniDms users, so it supports caution rather than a diabetes-specific threshold.

Use these conservative **product gates** in V1:

| Output                         | Minimum qualifying data                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Individual outcome             | One event; show coverage and gaps even when incomplete                                           |
| Descriptive repeated summary   | At least `5` comparable events across at least `3` distinct dates                                |
| Comparison between two cohorts | At least `10` comparable events in **each** cohort across at least `5` distinct dates per cohort |

For `5–9` events, say `limited repeated observations`, not `your pattern`. At `10+`, `recurring observation` is acceptable only if the raw distribution remains visible. Meeting a count alone does not validate a comparison.

Every repeated summary must show:

- `n` events and number of distinct dates;
- median and interquartile range, not only an average;
- individual event points or small traces;
- inclusion and exclusion rules;
- coverage and overlap counts; and
- the matching dimensions used.

Avoid p-values in the consumer UI. If an uncertainty interval is later added, specify and validate the method, account for repeated events from the same person, and keep the underlying events inspectable.

## Product data-quality gates

The international `70% over 10–14 days` rule is not an event-level rule. The following stricter gates are ShaniDms inferences intended to protect peak, nadir, and duration metrics:

1. Require a valid event start time and Workspace timezone.
2. For a baseline-derived metric, require at least three expected CGM readings in the preceding 30 minutes.
3. For inclusion in a repeated summary, require at least `90%` of expected readings in the primary meal window or the activity/during window.
4. Require no continuous gap longer than `20 minutes` in the analyzed window.
5. Assess acute and delayed windows independently. Missing delayed data must not invalidate a complete acute result.
6. Do not impute a peak, nadir, event duration, or iAUC across a material gap.
7. Mark device changes and different sampling intervals. Do not claim a difference smaller than known sensor uncertainty as meaningful.
8. Keep an incomplete event visible with `Not enough data for comparison`; do not silently delete it.

These numbers require usability and robustness testing. They must be configurable and versioned, not described as consensus requirements.

## Causality and wording guardrails

### Acceptable

- `In the two hours after 8 logged lunches, glucose was above 180 mg/dL for a median of 24 minutes.`
- `A later rise was observed in 5 of 7 comparable Meal Entries.`
- `During 6 logged walks, glucose decreased by a median of 18 mg/dL.`
- `Low glucose occurred 7 hours after this activity. Other meals, insulin, and activity also occurred in that period.`
- `These events coincided with...`
- `This association is based on a limited number of logged events.`

### Avoid

- `This meal caused a spike.`
- `This food is bad for you.`
- `Exercise improved/worsened your control.`
- `This workout caused the overnight low.`
- `Safe meal`, `unsafe activity`, `success`, `failure`, or `grade`.
- Any insulin, carbohydrate, or Loop-settings change presented as a consequence of the event analysis.

The view should name plausible missing or changing context: starting glucose and trend, insulin timing and amount, meal composition and portion, recent food or activity, illness, stress, sleep, menstrual cycle, sensor lag, and AID state. This list explains uncertainty; it must not be converted into an unvalidated causal model.

AI Analyst may summarize these deterministic results, but it must cite the included events, state sample size and uncertainty, and keep the same non-causal wording. An AI Specialist must not invent a medical score, silently change windows, or turn temporal association into a dosing recommendation.

## Validation before broad release

1. Freeze and version event boundaries, baseline rules, overlap rules, range thresholds, data-quality gates, and iAUC math.
2. Test calculations against independent fixtures for sensor intervals, missing blocks, duplicate readings, timezone changes, overlapping events, and readings exactly on range boundaries.
3. Compare product outputs with manual review by diabetes clinicians and exercise/nutrition specialists. Ask reviewers separately whether the display is factual, understandable, and likely to invite causal overinterpretation.
4. Measure test–retest reliability for repeated real-world meals and activities before generating rankings or recommendations.
5. Validate separately across diabetes type, age, insulin regimen, AID/non-AID use, CGM source, and activity type. Pregnancy requires its own target profile and review.
6. Run comprehension tests with Product Users who are the Data Subject, parents, caregivers, and clinicians. Verify that they understand `after` does not mean `because of`.
7. Audit AI output for causal claims, hidden exclusions, dosing language, and failures to disclose small samples or data gaps.

Until that validation is complete, all comparisons are exploratory personal observations. They must not drive automatic alerts, therapy changes, rankings, or a meal/activity score.

## Primary and high-trust sources

- American Diabetes Association Professional Practice Committee. [6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026](https://doi.org/10.2337/dc26-S006). _Diabetes Care_. 2026;49(Suppl. 1):S132–S149.
- American Diabetes Association Professional Practice Committee. [5. Facilitating Positive Health Behaviors and Well-being to Improve Health Outcomes: Standards of Care in Diabetes—2026](https://doi.org/10.2337/dc26-S005). _Diabetes Care_. 2026;49(Suppl. 1):S89–S131.
- Battelino T, et al. [Clinical Targets for Continuous Glucose Monitoring Data Interpretation: Recommendations From the International Consensus on Time in Range](https://doi.org/10.2337/dci19-0028). _Diabetes Care_. 2019;42(8):1593–1603.
- Danne T, et al. [International Consensus on Use of Continuous Glucose Monitoring](https://doi.org/10.2337/dc17-1600). _Diabetes Care_. 2017;40(12):1631–1640.
- Battelino T, et al. [Continuous glucose monitoring and metrics for clinical trials: an international consensus statement](<https://doi.org/10.1016/S2213-8587(22)00319-9>). _Lancet Diabetes & Endocrinology_. 2023;11(1):42–57.
- Moser O, et al. [Glucose management for exercise using CGM and isCGM systems in type 1 diabetes: EASD/ISPAD position statement](https://doi.org/10.1007/s00125-020-05263-9). _Diabetologia_. 2020;63:2501–2520.
- Colberg SR, et al. [Physical Activity/Exercise and Diabetes: A Position Statement of the American Diabetes Association](https://doi.org/10.2337/dc16-1728). _Diabetes Care_. 2016;39(11):2065–2079.
- Johansen MD, et al. [Interindividual and Intraindividual Variations in Postprandial Glycemia Peak Time](https://doi.org/10.1177/193229681200600221). _Journal of Diabetes Science and Technology_. 2012;6(2):356–361.
- Merino J, et al. [Validity of continuous glucose monitoring for categorizing glycemic responses to diet](https://doi.org/10.1093/ajcn/nqac026). _American Journal of Clinical Nutrition_. 2022;115(6):1569–1576.
- Hengist A, et al. [Imprecision nutrition? Intraindividual variability of glucose responses to duplicate presented meals in adults without diabetes](https://doi.org/10.1016/j.ajcnut.2024.10.007). _American Journal of Clinical Nutrition_. 2025;121(1):74–82.
- Scidà G, et al. [Postprandial Glucose Control With Different Hybrid Closed-Loop Systems According to Type of Meal in Adults With Type 1 Diabetes](https://doi.org/10.1177/19322968241256475). _Journal of Diabetes Science and Technology_. Published online 2024.
- Giosuè A, et al. [Reproducibility of CGM-derived postprandial glucose features and their association with glycemic control in type 2 diabetes](https://doi.org/10.1038/s41387-026-00435-9). _Nutrition & Diabetes_. 2026.
- Moser O, et al. [Accuracy of Continuous Glucose Monitoring before, during, and after Aerobic and Anaerobic Exercise in Type 1 Diabetes](https://pmc.ncbi.nlm.nih.gov/articles/PMC5872070/). _Biosensors_. 2018;8(1):22.
