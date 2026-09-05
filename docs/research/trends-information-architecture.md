# Trends V1: evidence-based information architecture

Status: product research recommendation  
Evidence reviewed: 2026-08-29  
Scope: CGM trend views and metrics for ShaniDms. This is product guidance, not medical advice.

## Recommendation

Trends V1 should have three primary destinations:

1. **Overview** — range distribution, mean glucose, GMI, variability, data sufficiency, and a concise comparison with the previous matched period.
2. **AGP & Daily Patterns** — the standardized 24-hour AGP view plus the individual daily profiles that explain or challenge the aggregate pattern.
3. **Compare Periods** — a deliberate comparison of two equal periods, with coverage and target settings visible for both.

Two subjects should remain deep screens or cross-links:

- **Hypoglycemia Investigation** — opened from TBR or a low-glucose safety card. Aggregate TBR belongs in Overview; event-level investigation does not.
- **Therapy Context** — insulin, carbohydrates, meals, and automated-delivery state. This belongs under Loop/therapy analysis or as an optional Trends drill-down when reliable data exists.

Mean glucose, GMI, CV, TIR, TBR, and TAR are metrics inside Overview. They do not each justify a separate destination. Likewise, nighttime and post-meal views are useful filters within AGP/Daily Patterns, not separate V1 modules.

## What clinical standards actually establish

### Core CGM summary

For most nonpregnant adults, the current ADA Standards list these core CGM metrics and guide values:

| Metric                           | Standard presentation or guide value                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| Data period                      | At least 14 days for pattern management                                           |
| CGM active                       | At least 70% of the 14-day period                                                 |
| Time above 250 mg/dL             | Under 5%                                                                          |
| Time above 180 mg/dL             | Under 25%, including time above 250                                               |
| Time in 70–180 mg/dL             | Over 70%                                                                          |
| Time below 70 mg/dL              | Under 4%, including time below 54                                                 |
| Time below 54 mg/dL              | Under 1%                                                                          |
| Glucose coefficient of variation | At or below 36%                                                                   |
| Mean glucose                     | Report it; no universal goal is specified in the table                            |
| GMI                              | Report it as an approximation of A1C; no universal goal is specified in the table |

These values come from the [ADA Standards of Care in Diabetes—2026, Section 6](https://doi.org/10.2337/dc26-S006), which adapts the [2019 International Consensus on Time in Range](https://doi.org/10.2337/dci19-0028). The ranges and goals must be individualized. Older people with complex health needs have different guide values, and pregnancy uses a different target range; the UI must not silently apply the nonpregnant-adult profile to everyone.

The five range bands should be shown together. TBR below 54 mg/dL is a subset of TBR below 70 mg/dL, and TAR above 250 mg/dL is a subset of TAR above 180 mg/dL. The product must not add the nested percentages as though they were independent totals.

The 2019 consensus gives safety priority to reducing time below range before trying to improve other ranges. This supports a prominent low-glucose entry point, but it does not support an automated diagnosis or dose change.

### Standardized report and daily detail

The [ADA Standards of Care in Diabetes—2026, Section 7](https://doi.org/10.2337/dc26-S007) recommends a standardized single-page report and says daily, weekly, and raw-data views should also be available. The [2017 International Consensus on CGM](https://doi.org/10.2337/dc17-1600) identifies AGP as the standard retrospective visualization and pairs it with daily profiles.

The official [International Diabetes Center AGP report](https://www.healthpartners.com/institute/wp-content/uploads/2025/09/AGP-Report-TITR.060125proof.pdf) combines three things:

- glucose statistics and time in ranges;
- a 24-hour composite using a median line and percentile bands;
- individual daily profiles.

The AGP is a summary of many days plotted as though they occurred in one day. It reveals recurring time-of-day patterns. It does not show that the pattern occurred every day, so daily profiles are necessary to inspect exceptions and gaps.

### Data sufficiency

The current ADA guide is 10–14 days with at least 70% active data for assessing TIR and other CGM metrics. The original sampling study, [Riddlesworth et al.](https://doi.org/10.1089/dia.2017.0455), found that approximately 14 days estimated three-month mean glucose, TIR, and TAR reasonably well. Estimates for rare hypoglycemia and variability were less stable.

Therefore, 14 days and 70% are a minimum interpretation gate, not a guarantee that every metric is representative. A seven-day view can still be useful as a recent snapshot, but ShaniDms should not label it a stable long-term pattern.

### GMI and variability

GMI is calculated from mean CGM glucose. It is not a laboratory A1C. The original [GMI consensus paper](https://doi.org/10.2337/dc18-1581) was explicit that the two can differ for the same person. The current ADA table likewise describes GMI as approximating A1C and “not always equivalent.”

CV is the standard relative variability measure. A value at or below 36% is a consensus guide, while values above 36% have been associated with hypoglycemia. CV is not a safety guarantee and should not become a standalone score.

### Insulin, carbohydrates, and automated delivery

Insulin and carbohydrate data provide explanatory context, but they are not part of the minimum universal CGM metric set. The peer-reviewed [Consensus Recommendations for Automated Insulin Delivery](https://doi.org/10.1210/endrev/bnac022) proposes an AID-specific report that includes:

- percentage of time CGM and AID were active;
- TIR/TBR/TAR, mean, GMI, and CV;
- user-initiated boluses, algorithm-modulated insulin, and daily total insulin;
- meal and carbohydrate entries;
- daily glucose-and-insulin profiles.

This supports a therapy-context drill-down when Nightscout supplies sufficiently complete and correctly classified records. It does not make insulin or carbohydrate overlays mandatory for every Trends user.

## Product information architecture

The following is a ShaniDms product inference from the evidence. It is not itself a clinical standard.

### 1. Overview

Purpose: answer “How was this period?” in a few seconds.

Top of screen:

- selected period and timezone;
- latest data timestamp;
- days containing data and percentage active;
- target profile in use, such as “nonpregnant adult 70–180”; and
- a clear partial-data warning when coverage is insufficient.

Core blocks:

- one five-band TIR/TBR/TAR visualization, showing percentages and time per day;
- mean glucose, GMI, and CV in one “level and variability” block;
- a low-glucose card that opens Hypoglycemia Investigation;
- a compact previous-period comparison using absolute deltas; and
- links to AGP, daily profiles, and the full comparison screen.

Rules:

- Never hide the coverage state behind an information icon.
- Show raw results when coverage is low, but label them as partial and avoid confident interpretation.
- Do not turn all metrics into a single health score.
- Do not call a period “good” or “bad” solely from one metric.

### 2. AGP & Daily Patterns

Purpose: answer “At what times do patterns repeat, and on which days do they differ?”

Default presentation:

- a 14-day AGP when enough data exists;
- median, inner percentile band, outer percentile band, and target-range boundaries;
- exact date range, coverage, and target profile;
- selectable time blocks such as overnight, morning, afternoon, and evening; and
- daily profiles directly below the AGP on large screens or one tap away on a phone.

Daily profiles should allow opening a day with its glucose trace and contextual events. “Best day,” “worst day,” weekday/weekend, overnight, and post-meal are useful filters or lenses. They should not be presented as standardized clinical metrics or causal conclusions.

### 3. Compare Periods

Purpose: answer “What changed between two periods?”

Default comparison:

- selected period versus the immediately preceding period of equal length;
- identical range thresholds and timezone treatment;
- coverage shown separately for both periods; and
- absolute changes for all five range bands, mean glucose, GMI, and CV.

Comparison is a product feature, not a distinct requirement of the CGM consensus standards. ShaniDms should therefore use neutral language: “higher,” “lower,” and “changed by,” not “the settings improved” or “the meal caused.”

The comparison can display annotations for therapy-setting changes, meals, exercise, illness, or sensor gaps. These are context. They do not establish causality. When one period has inadequate or materially different coverage, the screen should warn the user and avoid a headline conclusion.

### 4. Hypoglycemia Investigation: deep destination

Overview owns aggregate TBR. The investigation screen owns:

- event count and duration;
- severity and time below 54 mg/dL;
- time-of-day clustering;
- surrounding glucose trace;
- nearby insulin, carbohydrates, activity, and AID state when available; and
- links to the relevant day.

This boundary keeps the Trends landing page concise without weakening the consensus priority given to hypoglycemia. The investigation may describe observed timing and associations. It must not diagnose the cause or change doses automatically.

### 5. Therapy Context: optional deep destination

This screen should appear only when the source data supports it. It may include total insulin, user-initiated and algorithm-modulated insulin, bolus and carbohydrate timing, AID active percentage, and aligned daily traces.

“Open loop versus closed loop” should be a filter or stratified comparison inside this screen, not a primary Trends destination. A trustworthy comparison requires:

- reliable mode-state classification;
- visible exposure time and data coverage in each mode;
- enough observations in both modes;
- comparable dates and times of day; and
- a warning that mode choice may coincide with illness, exercise, sensor failure, missed entries, or other confounders.

The safe claim is “outcomes observed while each mode was active.” The unsafe claim is “closed loop caused the improvement.”

## What not to overstate

- **A five-point TIR increase is not a personal guarantee.** The international consensus treats each absolute 5% increase as clinically meaningful at a population level. It does not prove that a specific intervention caused an individual change.
- **GMI is not lab A1C.** Label it “GMI” and explain the difference nearby.
- **Fourteen days is not universally sufficient.** It is a practical standard for pattern review. Rare lows and CV can require more data.
- **Seventy percent coverage does not erase bias.** Long systematic gaps, such as every night, can make a period misleading even when the total percentage passes.
- **AGP is not a literal typical day.** It is an aggregate of values by time of day and can conceal exceptional days.
- **CV at or below 36% is not proof of safety.** TBR and event detail still matter.
- **Insulin and carbohydrate proximity is not causation.** Entries may be missing, delayed, estimated, or recorded in another system.
- **Open-versus-closed-loop results are observational.** Mode availability and user behavior can differ systematically.
- **Targets are not universal.** Pregnancy, older age, hypoglycemia risk, and individualized clinical plans can require different ranges and goals.
- **Do not infer a dose recommendation from summary metrics alone.** ShaniDms may help a user or clinician inspect evidence, but an AI suggestion must remain clearly advisory and traceable to the underlying data.

## V1 acceptance rules

1. Every Trends screen displays period, timezone, target profile, last data time, days with data, and active percentage.
2. Overview contains the five nested range bands plus mean, GMI, and CV.
3. GMI is never labeled estimated A1C without an explicit qualification.
4. A 14-day/70% gate controls confidence language, not access to the raw data.
5. AGP is paired with daily profiles and never shown without its date range and coverage.
6. Period comparison uses equal durations and identical thresholds by default.
7. Low-glucose summaries link to event-level investigation.
8. Insulin, carbohydrate, and AID views disclose source completeness and remain contextual.
9. Open/closed-loop comparison is hidden when state classification or exposure is insufficient.
10. No Trends view claims causation, performs an automatic dose change, or collapses the record into one unexplained score.

## Primary sources

- American Diabetes Association Professional Practice Committee. [6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026](https://doi.org/10.2337/dc26-S006). _Diabetes Care_. 2026;49(Suppl. 1):S132–S149.
- American Diabetes Association Professional Practice Committee. [7. Diabetes Technology: Standards of Care in Diabetes—2026](https://doi.org/10.2337/dc26-S007). _Diabetes Care_. 2026;49(Suppl. 1):S150–S165.
- Battelino T, et al. [Clinical Targets for Continuous Glucose Monitoring Data Interpretation: Recommendations From the International Consensus on Time in Range](https://doi.org/10.2337/dci19-0028). _Diabetes Care_. 2019;42(8):1593–1603.
- Danne T, et al. [International Consensus on Use of Continuous Glucose Monitoring](https://doi.org/10.2337/dc17-1600). _Diabetes Care_. 2017;40(12):1631–1640.
- International Diabetes Center, HealthPartners Institute. [AGP Report: Continuous Glucose Monitoring](https://www.healthpartners.com/institute/wp-content/uploads/2025/09/AGP-Report-TITR.060125proof.pdf). 2025.
- Phillip M, et al. [Consensus Recommendations for the Use of Automated Insulin Delivery Technologies in Clinical Practice](https://doi.org/10.1210/endrev/bnac022). _Endocrine Reviews_. 2023;44(2):254–280.
- Riddlesworth TD, et al. [Optimal Sampling Duration for Continuous Glucose Monitoring to Determine Long-Term Glycemic Control](https://doi.org/10.1089/dia.2017.0455). _Diabetes Technology & Therapeutics_. 2018;20(4):314–316.
- Bergenstal RM, et al. [Glucose Management Indicator (GMI): A New Term for Estimating A1C From Continuous Glucose Monitoring](https://doi.org/10.2337/dc18-1581). _Diabetes Care_. 2018;41(11):2275–2280.
