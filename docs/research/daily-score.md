# Daily CGM score: clinical evidence and product guardrails

Status: product research recommendation  
Evidence reviewed: 2026-08-29  
Scope: whether ShaniDms should present one score for a calendar day of CGM data. This is product guidance, not medical advice or a dosing algorithm.

## Bottom line

There is **no clinically standardized single daily CGM or diabetes score** in the ADA Standards of Care or the international CGM consensus statements. This is an inference from what those standards actually define: separate CGM metrics, individualized targets, and retrospective interpretation over roughly 10–14 days—not one score for one day. The [ADA Standards of Care in Diabetes—2026, Section 6](https://doi.org/10.2337/dc26-S006) recommends assessing glycemia with A1C and/or CGM metrics such as TIR, TAR, and TBR. Its standard CGM table also includes mean glucose, GMI, and CV, but no daily composite score.

A validated composite called the **Glycemia Risk Index (GRI)** does exist. It was derived from clinician rankings of **14-day** CGM tracings from 225 insulin-treated adults, rated by 330 experienced clinicians. It combines time in four exclusive low/high ranges and correlated closely with the clinicians' overall rankings. It was not developed or validated as a one-day score, a treatment recommendation, or a predictor that can safely drive insulin changes. See [Klonoff et al., 2022](https://doi.org/10.1177/19322968221085273).

Therefore:

- The current ShaniDms `0–100` daily score must be treated as a **ShaniDms product inference**, not a clinical measure.
- V1 should lead with a transparent component summary rather than a number.
- If a number is retained, it should be optional, experimental, coverage-gated, fully explained, and excluded from dosing or automated therapy decisions.
- ShaniDms may calculate the published GRI over an adequate multi-day period and label it `GRI`; it should not call a one-day adaptation `GRI` or imply the same validation.

## What is standardized

For many nonpregnant adults, the ADA 2026 table and the [2019 International Consensus on Time in Range](https://doi.org/10.2337/dci19-0028) provide these guide values:

| Metric                                        | Guide value for many nonpregnant adults |
| --------------------------------------------- | --------------------------------------- |
| TBR below 54 mg/dL                            | Under 1%                                |
| TBR below 70 mg/dL, including time below 54   | Under 4%                                |
| TIR 70–180 mg/dL                              | Over 70%                                |
| TAR above 180 mg/dL, including time above 250 | Under 25%                               |
| TAR above 250 mg/dL                           | Under 5%                                |
| Glucose coefficient of variation              | At or below 36%                         |

The standard five-band presentation uses **exclusive** bands: `<54`, `54–69`, `70–180`, `181–250`, and `>250 mg/dL`. These sum to 100%. By contrast, the clinical targets for `<70` and `>180` are cumulative. Implementations must not add a nested total and its subset as though they were separate exposure.

The [2019 consensus](https://doi.org/10.2337/dci19-0028) gives first priority to reducing time below range, then increasing TIR and reducing TAR. This ordering supports making low exposure prominent. It does not establish weights for a daily score.

The CV guide of 36% comes from evidence associating higher variability with more hypoglycemia, including the original study by [Monnier et al., 2017](https://doi.org/10.2337/dc16-1769). CV remains a separate descriptive metric; it is not a complete measure of safety.

TIR has meaningful clinical evidence as a component metric. In a DCCT analysis, lower estimated TIR was associated with greater retinopathy progression and microalbuminuria risk. That study used repeated seven-point capillary profiles rather than modern daily CGM and does not validate a one-day product score. See [Beck et al., 2019](https://doi.org/10.2337/dc18-1444).

## The evidence is multi-day, not daily

The [2017 International Consensus on CGM](https://doi.org/10.2337/dc17-1600) recommends at least 14 consecutive days and roughly 70–80% of possible readings for retrospective analysis. ADA 2026 similarly describes a 10–14-day CGM assessment with at least 70% wear as useful for clinical management.

The original sampling study by [Riddlesworth et al., 2018](https://doi.org/10.1089/dia.2017.0455) compared shorter samples with three months of CGM data in 257 people with type 1 diabetes. Correlation plateaued near 14 days for mean glucose, TIR, and TAR. Estimates were weaker for TBR and CV. This means that even a complete single day can describe that day, but it cannot be presented as a stable estimate of the person's glycemic status.

GMI is also unsuitable as a daily scoring component. It is calculated from mean CGM glucose and is intended to summarize a sufficiently long CGM period. It is not laboratory A1C and the two may differ for the same person. See [Bergenstal et al., 2018](https://doi.org/10.2337/dc18-1581).

## Components suitable for an optional product score

The safest candidate inputs are the standardized five time-in-range bands because they are understandable, mutually exclusive, and already central to CGM reporting:

1. time below 54 mg/dL;
2. time from 54 through 69 mg/dL;
3. time from 70 through 180 mg/dL;
4. time from 181 through 250 mg/dL; and
5. time above 250 mg/dL.

Any candidate score should also carry **data coverage as a validity gate**, not as a glycemic achievement component.

Other metrics should remain alongside the score rather than silently changing it:

- **CV:** useful stability context, preferably interpreted over a rolling multi-day period; a one-day CV may be unstable.
- **Mean glucose:** standardized for reporting, but ADA provides no universal target in its CGM table and mean alone can conceal lows and highs.
- **GMI:** show only for an adequate multi-day period; never use it in a daily score.
- **Hypoglycemia episode count and duration:** valuable safety context, using the consensus episode definition, but not a validated ingredient of a daily composite score.
- **Insulin, carbohydrates, meals, activity, and Loop mode:** explanatory context only. Completeness varies and temporal proximity does not prove causation.

### What GRI can and cannot contribute

The published GRI is:

`3.0 × % very low + 2.4 × % low + 1.6 × % very high + 0.8 × % high`, capped at 100,

where the four inputs are the exclusive `<54`, `54–69`, `>250`, and `181–250 mg/dL` bands. Lower is better. The original paper recommends displaying its hypoglycemia and hyperglycemia components separately as well as the combined index. See [Klonoff et al., 2022](https://doi.org/10.1177/19322968221085273).

GRI supports two design principles: severe excursions should not be hidden by TIR, and the low and high components should remain visible. It does **not** validate applying its formula to one calendar day or reversing it into a `100 = best day` product score. If ShaniDms offers GRI, the defensible V1 implementation is the published calculation over a rolling 14-day period, clearly separated from the daily review.

## Recommended V1 experience

### Default: no hero score

Lead with:

- a five-band range bar with percentage and minutes;
- a prominent low-exposure summary;
- mean glucose as context;
- data coverage and important gaps; and
- a neutral comparison with the person's recent adequate-data baseline.

Avoid `good day`, `bad day`, grades, ranks, streaks, praise, or blame based solely on glucose data. A day affected by illness, sensor gaps, or intentionally relaxed targets should not be framed as personal success or failure.

### Optional experimental score

If product testing requires a number, label it **ShaniDms Daily Summary Score (experimental)**. Do not label it clinical, validated, health, control, safety, or risk. The score card must always show:

- the five raw component percentages and minutes;
- the exact target profile and thresholds used;
- coverage and the largest data gap;
- an explanation of how each component affected the result;
- the formula version; and
- a short statement that it must not be used alone to change insulin or other therapy.

The exact weights should remain behind a research feature flag until they are prospectively specified and validated. Do not allow better TIR or lower TAR to conceal severe low exposure in the presentation. Do not use the score to trigger dosing advice, automatic settings changes, or an AI conclusion without showing the underlying metrics.

## Configuration

Configuration must be scoped to a Workspace and versioned with every stored score:

- target profile and all five band thresholds;
- Workspace timezone and calendar-day boundary;
- expected sensor interval and valid-reading rules;
- formula version; and
- data-coverage policy.

Targets must be individualized. ADA 2026 lists different guide values for some older adults with complex health, and the international consensus uses different targets for pregnancy. ShaniDms must not infer a target profile from whether the Product User is the Data Subject, a parent, caregiver, or clinician. A standard nonpregnant-adult preset may be offered, but it should be explicitly confirmed. Scores computed with different target profiles or formula versions must not be ranked or compared as if they were equivalent.

## Proposed minimum data requirements

There is no validated minimum for a single-day score. The following is a conservative **product gate**, not a clinical standard:

1. Score completed calendar days only, in the Workspace timezone.
2. Require at least 90% of expected readings after deduplication and timestamp validation.
3. Require no continuous missing interval longer than 60 minutes.
4. Show the coverage percentage and largest gap beside the score.
5. If the gate fails, show partial raw metrics and `Not enough data for a daily score`; do not impute a number.
6. For any baseline, GRI, GMI, or pattern claim, require at least 14 days with at least 70% active data and disclose when hypoglycemia or variability may need a longer period.

The 90% and 60-minute values are proposed safety-oriented product defaults. They must be tested rather than described as consensus requirements. Validation should compare several gates and different missing-data patterns, especially systematic overnight gaps.

## Validation plan before a broad release

1. **Freeze the specification.** Predefine thresholds, exclusions, weights, missing-data behavior, timezone behavior, and versioning. The LLM must not calculate or modify the score.
2. **Verify metric math.** Test the five exclusive bands, cumulative target values, day boundaries, duplicates, daylight-saving changes, and sensor interval changes against independent reference calculations.
3. **Use person-level data splits.** Develop and validate on separate people so repeated days from one person cannot leak across sets.
4. **Test diverse cohorts.** Include type 1 and type 2 diabetes, different ages, insulin regimens, AID/non-AID use, CGM brands, target profiles, and pregnancy only with an appropriate separate protocol.
5. **Test missingness and artifacts.** Remove readings in random and structured blocks, inject duplicate/outlier records, and measure score stability. A misleadingly stable score under missing nocturnal data is a failure.
6. **Test monotonic safety properties.** More time in an extreme low or high band must never improve the score when everything else is held constant. Low and high components must remain inspectable.
7. **Compare with accepted metrics.** Report TIR/TBR/TAR/CV alongside the candidate score and compare multi-day results with published GRI. Correlation alone is not validation because the candidate is built from those same inputs.
8. **Blinded expert review.** Ask clinicians to rate completed-day summaries without seeing the candidate score, then assess agreement, disagreement cases, and subgroup performance. Do not assume the 14-day GRI clinician rankings transfer to daily ratings.
9. **Prospective comprehension testing.** Verify that Product Users understand coverage, component trade-offs, and the non-treatment status of the score. Specifically test whether the number causes overreaction, shame, false reassurance, or inappropriate comparison between Data Subjects.
10. **External review and claims control.** Obtain independent clinical, privacy, and regulatory review before making claims about safety, risk, disease control, or clinical validation.

Until these steps are complete, the score should remain optional and experimental, with no effect on alerts, reminders, AI recommendations, ranks, or therapy workflows.

## Primary sources

- American Diabetes Association Professional Practice Committee. [6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026](https://doi.org/10.2337/dc26-S006). _Diabetes Care_. 2026;49(Suppl. 1):S132–S149.
- Battelino T, et al. [Clinical Targets for Continuous Glucose Monitoring Data Interpretation: Recommendations From the International Consensus on Time in Range](https://doi.org/10.2337/dci19-0028). _Diabetes Care_. 2019;42(8):1593–1603.
- Danne T, et al. [International Consensus on Use of Continuous Glucose Monitoring](https://doi.org/10.2337/dc17-1600). _Diabetes Care_. 2017;40(12):1631–1640.
- Riddlesworth TD, et al. [Optimal Sampling Duration for Continuous Glucose Monitoring to Determine Long-Term Glycemic Control](https://doi.org/10.1089/dia.2017.0455). _Diabetes Technology & Therapeutics_. 2018;20(4):314–316.
- Klonoff DC, et al. [A Glycemia Risk Index (GRI) of Hypoglycemia and Hyperglycemia for Continuous Glucose Monitoring Validated by Clinician Ratings](https://doi.org/10.1177/19322968221085273). _Journal of Diabetes Science and Technology_. 2023;17(5):1226–1242. Published online 2022.
- Monnier L, et al. [Toward Defining the Threshold Between Low and High Glucose Variability in Diabetes](https://doi.org/10.2337/dc16-1769). _Diabetes Care_. 2017;40(7):832–838.
- Beck RW, et al. [Validation of Time in Range as an Outcome Measure for Diabetes Clinical Trials](https://doi.org/10.2337/dc18-1444). _Diabetes Care_. 2019;42(3):400–405.
- Bergenstal RM, et al. [Glucose Management Indicator (GMI): A New Term for Estimating A1C From Continuous Glucose Monitoring](https://doi.org/10.2337/dc18-1581). _Diabetes Care_. 2018;41(11):2275–2280.
