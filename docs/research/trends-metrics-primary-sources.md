# Trends metrics: primary-source formulas and conservative product gates

Status: implementation research note  
Evidence reviewed: 2026-08-30  
Scope: GMI, CGM/AGP data sufficiency, glucose CV, and GRI for the ShaniDms Trends domain. This is product implementation guidance, not medical advice or a dosing algorithm.

## Implementation answer

Use these published calculations:

```text
GMI (%) = 3.31 + 0.02392 * mean glucose (mg/dL)

CV (%) = 100 * glucose standard deviation / mean glucose

Hypoglycemia component = VLow + 0.8 * Low
Hyperglycemia component = VHigh + 0.5 * High
GRI raw = 3.0 * VLow + 2.4 * Low + 1.6 * VHigh + 0.8 * High
GRI = min(100, GRI raw)
```

The four GRI inputs are **percentages on a 0–100 scale in mutually exclusive bands**:

| Input   | Published band                 |
| ------- | ------------------------------ |
| `VLow`  | glucose `<54 mg/dL`            |
| `Low`   | glucose `>=54 and <70 mg/dL`   |
| `High`  | glucose `>180 and <=250 mg/dL` |
| `VHigh` | glucose `>250 mg/dL`           |

`70–180 mg/dL`, inclusive, is the unweighted in-range band. In particular, exactly `54` is `Low`, exactly `70` and `180` are in range, and exactly `250` is `High`.

For a conservative V1 interpretation gate, require a **14-consecutive-day window with at least 70% active CGM data** before presenting GMI, GRI, AGP patterns, or period comparisons as representative. Duration and coverage are separate conditions: 100% coverage of one day is not sufficient for a 14-day pattern claim. Raw shorter-period data may remain visible, but the UI must label it as a short or partial view.

## 1. GMI

### Established facts

The original GMI paper defines the canonical equation as:

```text
GMI (%) = 3.31 + 0.02392 * mean CGM glucose in mg/dL
```

It recommends at least 10 days and preferably 14 or more days of CGM data. Its patient-facing explanation uses 14 or more days. The formula was derived from contemporaneous CGM mean glucose and laboratory A1C data in 528 people. The paper also shows that GMI and laboratory A1C frequently differ: 28% of paired values differed by at least 0.5 percentage points. [Bergenstal et al., 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6196826/)

The ADA 2026 Standards still include GMI as a standard CGM metric, describing it as an approximation of A1C that is “not always equivalent.” They do not replace it with a different standard equation. [ADA Standards of Care 2026, Section 6](https://doi.org/10.2337/dc26-S006)

There is emerging research on an updated GMI equation, but it is not a replacement adopted by the cited ADA 2026 CGM table. ShaniDms should therefore version the current calculation as `gmi-2018` and must not silently switch formulas. [ADA 2025 scientific abstract on updated GMI](https://diabetesjournals.org/diabetes/article/74/Supplement_1/165-OR/159885/165-OR-Improving-A1C-and-CGM-Average-Glucose)

### Conservative product decisions

- Calculate from the unrounded arithmetic mean of valid, deduplicated CGM samples.
- Keep the unrounded result internally. Round only for display; one decimal place matches the examples in the source paper.
- Label the value `GMI`, not `A1C`, `estimated A1C`, or a laboratory result.
- Show the date range and data coverage next to the value.
- Do not present GMI as representative unless the 14-day/70% gate passes.
- Store a formula version with any persisted or cached derived result.

## 2. CGM and AGP data sufficiency

### Established facts

The 2017 ATTD international consensus recommends at least two weeks and 70–80% of possible CGM readings. It states that at least 14 consecutive days with about 70% of possible readings supports retrospective analysis and recommends AGP as the standard visualization. [Danne et al., 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC6467165/)

The 2019 international Time in Range consensus simplifies this to:

- recommended wear period: 14 days;
- recommended active data: 70% of those 14 days;
- AGP as the standardized report;
- CV target: at or below 36%.

It also says that more than 70% use over the most recent 14 days correlates strongly with three-month mean glucose, time in ranges, and hyperglycemia metrics. Hypoglycemia and variability are less stable, and a longer period may be needed in people with more variable glycemia. [Battelino et al., 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6973648/)

The sampling study underlying the 14-day recommendation compared incremental samples with three months of CGM in 257 people with type 1 diabetes. Performance plateaued around 14 days. Reported `R²` values were `0.84–0.86` for mean glucose, TIR, and TAR, but lower for TBR below 70 (`0.76`) and CV (`0.70`). [Riddlesworth et al., 2018](https://doi.org/10.1089/dia.2017.0455)

The current ADA 2026 Standards say a 10–14-day assessment with at least 70% wear can be useful. Their formal CGM table uses **at least 14 days for pattern management** and **70% active time out of 14 days**. [ADA Standards of Care 2026, Section 6](https://doi.org/10.2337/dc26-S006)

### What the evidence does not establish

- Passing 14 days/70% does not prove that missing data are unbiased.
- The sources do not define a Nightscout-specific algorithm for duplicate records, irregular cadence, or long systematic gaps.
- The original GRI paper does not define a separate GRI-specific coverage threshold.
- The gate supports representative retrospective interpretation; it does not make every metric equally stable.

### Conservative product decisions

- Use `periodDurationStatus` and `coverageStatus` as separate fields. Do not compress them into one Boolean.
- Use `>=70%` as the pass boundary for a 14-day report.
- Calculate active percentage from the declared source cadence or covered time after deduplication. Do not allow duplicate readings to inflate coverage.
- Surface the largest continuous gap. Warn when gaps are concentrated in a recurring time block, even if aggregate coverage passes.
- Do not impute missing glucose for clinical metrics in V1.
- A 7-day or 1-day view may show descriptive raw metrics, but it must not be described as a stable AGP, GMI, GRI, or long-term pattern.
- Consider a longer window or a low-confidence warning for rare hypoglycemia and CV; 14 days is a minimum practical gate, not a guarantee.

## 3. Glucose coefficient of variation

### Established facts

The published calculation is:

```text
CV (%) = 100 * SD / mean glucose
```

The study that proposed the 36% threshold calculated `%CV = (SD / mean) * 100` in 376 people with diabetes. It found more hypoglycemia above 36%, especially in insulin-treated groups. [Monnier et al., 2017](https://pubmed.ncbi.nlm.nih.gov/28039172/)

There is a boundary wording nuance across primary guidance:

- the 2017 ATTD table labels `<36%` stable and `>=36%` unstable;
- the 2019 consensus and ADA 2026 table give a goal of `<=36%`;
- ADA 2026 prose describes `>36%` as high CV and related to hypoglycemia.

The 2019 and 2026 tables also note that some studies suggest `<33%` may offer additional hypoglycemia protection for people using insulin or sulfonylureas. [Danne et al., 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC6467165/), [Battelino et al., 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6973648/), [ADA Standards of Care 2026, Section 6](https://doi.org/10.2337/dc26-S006)

### Conservative product decisions

- Use neutral UI wording: `within the <=36% guide` and `above the 36% guide`. Avoid a categorical `stable/unstable` label at exactly 36%.
- Treat `<33%` as optional explanatory context, not the default target.
- Use the population SD of the valid readings for a deterministic whole-window summary, document that choice, and version it. The clinical sources specify SD/mean but do not standardize a software denominator convention.
- Do not calculate CV when there are no valid samples or the mean is not positive.
- Do not let a favorable CV hide TBR. CV is a separate variability metric, not a safety score.

## 4. GRI

### Established facts

The original GRI study used 14-day CGM traces from 225 insulin-treated adults. A total of 330 experienced clinicians ranked the traces. The resulting model had `R² = 0.904` against clinician rankings. [Klonoff et al., 2022/2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10563532/)

The paper defines:

```text
Hypoglycemia component = VLow + 0.8 * Low
Hyperglycemia component = VHigh + 0.5 * High

GRI raw = 3.0 * Hypoglycemia component
        + 1.6 * Hyperglycemia component

GRI raw = 3.0 * VLow
        + 2.4 * Low
        + 1.6 * VHigh
        + 0.8 * High

GRI = min(100, GRI raw)
```

The inputs are percentages, not fractions. The original paper's worked example is:

```text
VLow = 5, Low = 10, VHigh = 15, High = 20
Hypoglycemia component = 13
Hyperglycemia component = 25
GRI raw = 79
GRI = 79
```

Lower GRI is better. A raw result can exceed 100 mathematically, but the published score has a maximum permitted value of 100.

The formula must use the **exclusive** `Low` and `High` bands. It must not substitute cumulative TBR `<70` for `Low`, or cumulative TAR `>180` for `High`; doing so double-counts the extreme bands.

The authors say GRI can be calculated for a chosen period and that a multiweek trace can be split into daily or weekly GRIs. However, the derivation and clinician validation used 14-day traces. The paper also says GRI is a summary or screening score, not a substitute for individual metrics, and was based on clinician rankings rather than clinical outcomes. It identified pregnancy and children as populations requiring validation. [Klonoff et al., 2022/2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10563532/)

### Conservative product decisions

- Use the fixed published bands for canonical `GRI`; do not replace them with a user's custom TIR thresholds.
- Apply the general 14-day/70% interpretation gate because the GRI derivation used 14-day traces and the original paper gives no weaker coverage rule.
- Show the hypoglycemia and hyperglycemia components beside the combined GRI.
- Keep GRI optional. Do not make it the app's default health score, daily grade, therapy recommendation, or alert trigger.
- If a daily experimental view is later added, label it as a period-specific calculation and state that the original clinician validation was on 14-day traces.
- If zones A–E are implemented, describe them as quintiles of the original clinician-ranking model, not validated outcome-risk categories.
- Store `gri-2022` as the formula version and keep raw inputs for explainability.

## 5. Required tests before shipping Trends metrics

### Formula tests

1. GMI source examples:
   - mean `100` -> raw `5.702`, display `5.7`;
   - mean `150` -> raw `6.898`, display `6.9`;
   - mean `200` -> raw `8.094`, display `8.1`.
2. GMI uses the unrounded mean and rounds only the final displayed value.
3. CV uses `100 * populationSD / mean`; `[100, 200]` -> `33.333...%`.
4. GRI worked example above -> hypoglycemia `13`, hyperglycemia `25`, GRI `79`.
5. All readings in `70–180` -> GRI `0`.
6. A mathematically greater-than-100 GRI is capped at `100` only after the raw formula is evaluated.
7. GRI rejects or explicitly normalizes fractions such as `0.05`; it must not silently confuse `0–1` inputs with `0–100` percentages.

### Range-boundary tests

Use separate classification assertions before percentage rounding:

|     Value | Expected canonical band |
| --------: | ----------------------- |
|  `53.999` | `VLow`                  |
|      `54` | `Low`                   |
|  `69.999` | `Low`                   |
|      `70` | `TIR`                   |
|     `180` | `TIR`                   |
| `180.001` | `High`                  |
|     `250` | `High`                  |
| `250.001` | `VHigh`                 |

This is especially important for the current Trends domain: a `<= veryLowMaxMgDl` comparison with a threshold of `54` incorrectly puts exactly `54` into `VLow`.

### Sufficiency and integrity tests

1. Exactly 14 consecutive days and exactly 70% active data pass.
2. `69.99%` fails the coverage gate.
3. One day at 100% coverage fails the duration gate.
4. Fourteen days at 100% coverage pass both gates.
5. Duplicate source readings do not raise sample count, coverage, mean weighting, or range percentages.
6. Out-of-window, nonfinite, nonpositive, and invalid-source records are excluded and reported in diagnostics.
7. A systematic overnight gap is surfaced even when aggregate coverage is at least 70%.
8. A shorter period can expose descriptive raw metrics but cannot acquire the `representative` interpretation state.
9. GMI, GRI, CV, ranges, and coverage all use the same deduplicated valid sample set.
10. The five exclusive bands sum to 100 within a declared floating-point tolerance; displayed rounding must not feed back into GRI.

### Presentation and safety tests

1. GMI is never labeled A1C and always includes the non-equivalence explanation.
2. Period, timezone, last reading, active percentage, and sufficiency state remain visible with GMI, GRI, and AGP.
3. CV `36.0%` uses neutral `within guide` wording; values above 36 use `above guide`.
4. GRI shows both components and never hides severe low exposure behind the total.
5. Custom target thresholds do not change canonical GRI inputs.
6. Low-data periods suppress confident comparison language and AI conclusions.
7. Formula version changes invalidate cached derived metrics.
8. Hebrew and English labels carry the same thresholds, units, and qualification text.

## Primary sources

- Bergenstal RM, et al. [Glucose Management Indicator (GMI): A New Term for Estimating A1C From Continuous Glucose Monitoring](https://pmc.ncbi.nlm.nih.gov/articles/PMC6196826/). _Diabetes Care_. 2018;41(11):2275–2280. DOI: [10.2337/dc18-1581](https://doi.org/10.2337/dc18-1581).
- Danne T, et al. [International Consensus on Use of Continuous Glucose Monitoring](https://pmc.ncbi.nlm.nih.gov/articles/PMC6467165/). _Diabetes Care_. 2017;40(12):1631–1640. DOI: [10.2337/dc17-1600](https://doi.org/10.2337/dc17-1600).
- Battelino T, et al. [Clinical Targets for Continuous Glucose Monitoring Data Interpretation: Recommendations From the International Consensus on Time in Range](https://pmc.ncbi.nlm.nih.gov/articles/PMC6973648/). _Diabetes Care_. 2019;42(8):1593–1603. DOI: [10.2337/dci19-0028](https://doi.org/10.2337/dci19-0028).
- American Diabetes Association Professional Practice Committee for Diabetes. [6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026](https://doi.org/10.2337/dc26-S006). _Diabetes Care_. 2026;49(Suppl. 1):S132–S149.
- Riddlesworth TD, et al. [Optimal Sampling Duration for Continuous Glucose Monitoring to Determine Long-Term Glycemic Control](https://doi.org/10.1089/dia.2017.0455). _Diabetes Technology & Therapeutics_. 2018;20(4):314–316.
- Monnier L, et al. [Toward Defining the Threshold Between Low and High Glucose Variability in Diabetes](https://pubmed.ncbi.nlm.nih.gov/28039172/). _Diabetes Care_. 2017;40(7):832–838. DOI: [10.2337/dc16-1769](https://doi.org/10.2337/dc16-1769).
- Klonoff DC, et al. [A Glycemia Risk Index (GRI) of Hypoglycemia and Hyperglycemia for Continuous Glucose Monitoring Validated by Clinician Ratings](https://pmc.ncbi.nlm.nih.gov/articles/PMC10563532/). _Journal of Diabetes Science and Technology_. 2023;17(5):1226–1242. Published online 2022. DOI: [10.1177/19322968221085273](https://doi.org/10.1177/19322968221085273).
