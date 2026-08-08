# Critical Review of `xbtlin/ai-berkshire`

## Scope

This review focuses on what should and should not be carried into a real-money decision-support implementation.

The source project is valuable as a **research process library**. It should not be treated as a validated quantitative investment model.

## Strong ideas to retain

### 1. Explicit research workflow

The source project forces consistent coverage of:

- business model;
- moat;
- management;
- inversion/risk;
- industry structure;
- valuation;
- portfolio context.

Consistency is valuable because it makes analyses comparable over time.

### 2. Data-gap awareness

Its A/B/C information-richness idea is strong: abundant information can create false confidence, while sparse information should not be automatically equated with a bad company.

### 3. Thesis decomposition

The thesis tracker turns a vague narrative into testable assumptions and review triggers. This is one of the best parts of the project and should become a first-class domain model.

### 4. Separation of monitoring from deep research

`news-pulse` explicitly treats rapid news/event attribution as triage rather than full research. The portfolio skill also warns against daily portfolio trading. That distinction is appropriate for our daily sentinel design.

### 5. Programmatic financial verification

The principle that calculations should be code-driven and auditable rather than performed mentally by an LLM is essential.

### 6. Primary-source preference

The project repeatedly instructs agents to verify material figures and prioritize original filings when sources disagree. We strengthen this into explicit source lineage/provenance.

---

## Methodological rules that must be changed

### 1. Thesis score -> trade action mapping

The source thesis tracker maps a simple arithmetic score directly to actions such as add, hold, reduce, and strongly sell.

Problem:

- weights are arbitrary and uncalibrated;
- assumptions differ greatly in economic importance;
- one weak assumption may be immaterial while another may be existential;
- valuation and portfolio context are not represented sufficiently;
- the mapping has not been statistically validated.

Decision:

**Do not implement this mapping.** Scores, if retained, are diagnostic summaries only.

### 2. Trigger -> forced trade rules

Examples in the source include red lines such as management integrity issues leading to immediate liquidation or metric deterioration leading to a fixed percentage reduction.

Problem:

- evidence may be incomplete or false;
- market liquidity/tax/currency/context may matter;
- a red-line event needs verification and thesis re-underwriting before action.

Decision:

A trigger creates `MAJOR_REVIEW_REQUIRED`, never an automatic order or forced percentage change.

### 3. Fixed portfolio concentration/cash ranges

The source suggests fixed bands for largest position, top-three concentration, holding count, and cash.

Problem:

These are stylistic opinions, not universal risk limits.

Decision:

Report concentration as facts. Any limits must be explicitly user-configured policy constraints.

### 4. Hard-coded risk-free rate

The source uses an approximate `~4%` cash/risk-free comparison.

Problem:

Risk-free/cash benchmarks vary by currency, tenor, jurisdiction, and date.

Decision:

Use a timestamped currency/tenor-specific benchmark source.

### 5. `FCF yield + growth` as primary expected-return estimate

Useful as a rough lens, but incomplete.

It can fail when:

- margins change;
- growth requires heavy reinvestment;
- share count changes;
- leverage changes;
- terminal valuation changes;
- the business is cyclical;
- FCF definition is distorted by stock compensation, working capital, or acquisitions.

Decision:

Keep only as a clearly labeled sanity check. Use scenario and sensitivity analysis with explicit assumptions.

### 6. Universal company-quality thresholds

The checklist uses examples such as ROE, gross-margin, FCF, and debt thresholds as broad quality gates.

Problem:

Sector economics differ. Banks, insurers, marketplaces, software, retailers, semiconductors, utilities, and asset-heavy businesses cannot be judged by identical thresholds.

Decision:

Metrics are sector/security-type specific; no universal numeric gate without explicit rationale.

### 7. Analyst target prices

The portfolio workflow gathers sell-side consensus and target prices.

Decision:

Allow as secondary context only. Do not feed target price consensus into primary valuation conclusions.

### 8. Historical performance claims

The source README reports strong two-year live returns.

Decision:

Do not use these results as validation of our implementation. They are not evidence that the workflow itself has causal/predictive edge, and short realized performance is highly path-dependent.

---

## Technical issues in source calculation tooling

### 1. Decimal promise is not fully upheld

`financial_rigor.py` uses `Decimal`, but converts values to `float` in important paths including:

- formatting;
- market-cap deviation;
- cross-source median/deviation;
- valuation return structures;
- scenario percentage changes/output.

CLI arguments are also parsed as `float` before Decimal conversion.

Decision:

Our financial domain accepts strings/Decimals and never uses JS `number` for financial arithmetic.

### 2. Cross-validation threshold inconsistency

The written financial-data policy says differences over 1% must be flagged, while `cross_validate` defaults to a 2% tolerance.

Decision:

Tolerances are field-specific, centralized policy values with explicit tests. No hidden default mismatch.

### 3. Source independence is not verified

Two websites may display the same upstream feed.

Decision:

Add source lineage and upstream-provider metadata before counting sources as independent.

### 4. Generic calculator uses `eval`

The source's `exact_calc` checks characters but executes a Python expression and then converts its result to Decimal. This also undermines exact arithmetic because ordinary Python numeric literals/operators can produce floats.

Decision:

Use a small parsed expression evaluator over Decimal or expose only named deterministic financial functions.

### 5. Three-scenario model naming and unused input

The model is essentially future EPS × terminal P/E under three assumptions. It accepts a shares input that is not used.

Decision:

Implement explicit named models with only required inputs and do not imply that EPS × terminal P/E is a DCF.

### 6. Benford analysis

The source provides a Benford check and warns that anomalies may indicate human adjustment.

Problem:

Benford applicability depends strongly on the dataset and sample-generation process; arbitrary selected financial values can produce misleading flags.

Decision:

Exclude Benford from the investment decision pipeline. If ever exposed as an exploratory statistic, it must carry strict applicability warnings and cannot generate fraud labels.

### 7. Report audit samples only a fraction of numeric statements

Randomly auditing 15% can be useful as a spot check but cannot certify a report's factual correctness. Regex extraction also cannot reliably understand accounting definition/context.

Decision:

Material decision fields are validated by schema and provenance at ingestion, not only by post-hoc report sampling. Report audits can remain an additional QA layer.

---

## Product-level risks

### Hallucinated completeness

A long polished report may appear safer than a short incomplete one.

Mitigation:

- missing/conflicting values remain first-class states;
- the UI displays evidence quality;
- the model is allowed to stop at `INSUFFICIENT EVIDENCE`.

### Automation bias

Users may over-trust a dashboard score or authoritative wording.

Mitigation:

- no magic composite buy score;
- show assumptions and strongest counterargument;
- make warnings/data cutoff visible;
- default disposition is no action/further research.

### Recency failures

Stale price/share-count/financial data can materially change valuation.

Mitigation:

- per-field timestamp/freshness policy;
- stale status propagates into the final memo;
- no current valuation label if critical fields are stale.

### Corporate-action errors

Splits, buybacks, issuance, ADR ratios, and adjusted historical prices can make otherwise correct arithmetic wrong.

Mitigation:

- dedicated corporate-action normalization;
- fixture tests for supported markets;
- explicit raw vs adjusted price semantics.

### Look-ahead bias

Historical evaluation can accidentally use information published after the decision date.

Mitigation:

- every evidence item has published/retrieved timestamps;
- historical analysis uses an `asOf` cutoff;
- evaluation fixtures reject future evidence.

### Prompt injection from external documents

Web/news/filing content is untrusted input.

Mitigation:

- no instructions are executed from retrieved text;
- typed adapters and allowlisted fetch paths;
- SSRF controls;
- clear data/tool boundary.

---

## Conclusion

The source project should be treated as a strong collection of **investment-research heuristics and workflow ideas**, not as a trading algorithm.

Our implementation keeps its best discipline—explicit thesis, inversion, verification, opportunity cost, and change tracking—while replacing unvalidated scoring/action rules with provenance, deterministic calculations, transparent assumptions, versioning, and human-reviewed decisions.
