# Research and Decision Policy

## Purpose

Adapt the useful research discipline in AI Berkshire into a process suitable for consequential, real-money decision support without pretending a qualitative framework is a validated trading algorithm.

## 1. Core principles retained

### 1.1 Business first

Understand how the economic engine works before discussing valuation.

For an operating company, analysis should cover:

- customer and value proposition;
- revenue and cash-generation mechanics;
- reinvestment needs;
- competitive advantages and their direction of change;
- management incentives and capital allocation;
- failure paths;
- long-term industry uncertainty;
- valuation and opportunity cost.

### 1.2 Inversion

Every material analysis must contain a serious attempt to disprove the thesis:

- what would make the business structurally worse?
- what evidence would show the moat is shrinking?
- what management behavior would change the trust assessment?
- which assumptions are most fragile?
- why might a well-informed skeptic disagree?

The bear case must not be a token paragraph added after a bullish narrative.

### 1.3 Explicit thesis

Each holding should have a versioned thesis containing:

1. business essence;
2. moat and direction;
3. management/capital allocation;
4. valuation assumptions;
5. downside/falsification logic.

It must then be decomposed into a small number of testable assumptions with evidence links.

### 1.4 Intellectual honesty

Allowed conclusions include:

- insufficient evidence;
- conflicting data;
- outside circle of competence;
- valuation too assumption-sensitive;
- thesis cannot yet be falsified with available evidence.

The system must not complete a template by inventing confidence.

## 2. Fact / analysis / uncertainty contract

Every decision memo uses three evidence classes.

### FACT

A statement directly supported by retrieved evidence.

Requirements:

- source URI;
- publication/reporting date;
- data period when applicable;
- units and currency;
- evidence quality status.

### ANALYSIS

An interpretation derived from facts.

Requirements:

- identify the facts it relies on;
- expose important assumptions;
- distinguish correlation from causation;
- avoid precision unsupported by the evidence.

### UNCERTAINTY

Material information that is unknown, disputed, stale, or model-dependent.

Uncertainty is part of the answer, not an error to hide.

## 3. Information richness

Retain the source project's A/B/C information-richness concept, but do not turn it into an investment-quality score.

- **A — rich:** abundant filings/coverage; primary risk is consensus/anchoring.
- **B — moderate:** some estimation required; estimated fields must be labeled.
- **C — sparse:** focus on first-principles questions and state missing evidence explicitly.

`A` does not mean good investment. `C` does not mean bad investment.

## 4. Company checklist

The checklist is a **research gate**, not a buy signal.

### Gate A — Understandability

Can the economic model and key value drivers be described clearly?

If not, disposition: `INSUFFICIENT_UNDERSTANDING`.

### Gate B — Business economics

Assess with industry-appropriate metrics. Do not apply universal thresholds such as "gross margin > 40%" or "ROE > 20%" across all sectors.

Possible dimensions:

- returns on incremental capital;
- free-cash-flow conversion;
- reinvestment runway;
- balance-sheet resilience;
- dilution;
- cyclicality;
- customer/supplier concentration.

### Gate C — Moat

Evidence for pricing power, switching costs, network effects, scale, cost advantage, distribution, brand, regulation, IP, or other defensibility.

Score direction of change separately from current strength.

### Gate D — Management

Assess evidence of:

- candor;
- capital allocation;
- incentives;
- related-party/governance risks;
- acquisition discipline;
- buyback/dilution behavior;
- succession/organizational dependence.

### Gate E — Valuation

No single multiple is intrinsic value.

Use multiple transparent lenses and sensitivity ranges. At minimum disclose:

- normalized earnings/FCF basis;
- growth assumptions;
- terminal assumptions/multiple where used;
- share-count assumptions;
- currency;
- scenario horizon;
- sensitivity to the most important variables.

### Gate F — Decision discipline

Record why the opportunity is being reviewed:

- fundamental change;
- valuation change;
- new evidence;
- portfolio opportunity cost;
- or merely price/news attention.

Price attention alone is not a thesis.

## 5. Thesis tracking

### Thesis status

- `green` — evidence broadly supports core assumptions;
- `yellow` — one or more assumptions weakening or data quality deteriorating;
- `red` — a core assumption is materially damaged and needs deep review;
- `broken` — the stated thesis is falsified by verified evidence;
- `insufficient_evidence` — status cannot be determined reliably.

### No mechanical action mapping

Do **not** implement:

```text
score 9-10 -> add
score 7-8  -> hold
score 3-4  -> reduce
score 1-2  -> sell
```

A health score may be shown as a summary if it is fully explainable, but action requires a separate memo considering valuation, tax/cost implications supplied by the user, portfolio context, evidence quality, and alternative opportunities.

### Review triggers

Examples:

- management integrity concern;
- structural competitive loss;
- regulatory change to the business model;
- sustained deterioration in a thesis-defining operating metric;
- major capital allocation change;
- material dilution or balance-sheet change.

A trigger means **re-run research**. It does not mean automatic liquidation.

## 6. Portfolio policy

### No universal concentration bands

Do not encode source-repo ranges such as:

- largest position < 40%;
- top 3 = 50–80%;
- 5–15 holdings;
- cash = 10–30%.

Those are opinions, not safety constraints.

Instead, portfolio diagnostics report facts:

- largest-position weight;
- top-N concentration;
- sector/theme exposure;
- country/regulatory exposure;
- currency exposure;
- correlated business-driver exposure;
- liquidity and security-type mix;
- cash allocation.

Any limits are user-configured policy constraints.

### Opportunity cost

Every new opportunity should be compared with:

- doing nothing;
- cash/short-duration benchmark in the relevant base currency;
- adding to an existing high-conviction holding;
- replacing the weakest existing thesis.

Do not use a hard-coded cash return. Fetch a current currency/tenor-appropriate benchmark and timestamp it.

### Security-type awareness

An ETF is not an operating company.

ETF analysis should emphasize:

- index methodology;
- holdings/concentration;
- factor exposures;
- expense ratio;
- tracking difference;
- liquidity/spread;
- currency exposure;
- distribution/tax characteristics where known;
- overlap with the rest of the portfolio.

Do not apply company moat/management/ROE checklists to an ETF.

## 7. Valuation policy

### Scenario analysis, not false precision

Scenario tools produce **conditional outputs**:

> If normalized EPS is X, grows at G for N years, and the terminal multiple is M, the implied value/return is Y.

They do not output "true intrinsic value" without qualification.

### Models

Potential lenses:

- normalized FCF yield + reinvestment/growth decomposition;
- owner-earnings scenario model;
- earnings power / no-growth value;
- reverse valuation (what assumptions are embedded in price?);
- multi-stage DCF only after cash-flow definitions and discount assumptions are explicit;
- relative valuation as contextual cross-check, not primary truth.

### Avoid misleading shortcuts

`expected return ≈ FCF yield + growth` may be displayed as a rough sanity check only. It fails when margins, reinvestment economics, dilution, leverage, cyclicality, or valuation multiples change materially.

## 8. News and daily monitoring

Daily monitoring asks:

> Did new verified information materially alter a thesis assumption or create a review trigger?

It does **not** ask:

> What should I trade today?

Price-move thresholds may prioritize investigation, but price movement alone is categorized as market information, not fundamental evidence.

Preferred output on most days:

```text
NO MATERIAL THESIS CHANGE
No action suggested. Next scheduled review unchanged.
```

## 9. Source policy

For material financial facts:

- primary filing/exchange source preferred;
- independent cross-check when available;
- source lineage recorded;
- discrepancies explained rather than averaged away;
- GAAP/non-GAAP distinctions preserved;
- exact reporting period preserved.

Analyst consensus and target prices may be shown in a clearly labeled context section but must not anchor the app's valuation result.

## 10. Prohibited shortcuts

The app must not:

- infer financial statement numbers from prose when raw figures are available;
- average contradictory accounting definitions into a fake consensus;
- claim two sources are independent without checking lineage;
- use a star score as a substitute for evidence;
- label a company fraudulent because of a Benford anomaly;
- use source-project performance screenshots as evidence the framework is predictive;
- use future information in historical evaluations;
- silently use current share count for historical per-share analysis;
- compare valuations across currencies without explicit normalization.

## 11. Decision memo contract

A full memo ends with:

```text
RESEARCH DISPOSITION:
NO ACTION | FURTHER RESEARCH | WATCH | CANDIDATE | THESIS REVIEW REQUIRED

EVIDENCE QUALITY:
HIGH | MEDIUM | LOW

THESIS STATUS:
GREEN | YELLOW | RED | BROKEN | INSUFFICIENT EVIDENCE

KEY FACTS:
...

KEY ASSUMPTIONS:
...

STRONGEST COUNTERARGUMENT:
...

VALUATION SCENARIOS:
...

PORTFOLIO OPPORTUNITY COST:
...

WHAT WOULD CHANGE THE VIEW:
...

DATA CUTOFF / WARNINGS:
...
```

If a conversational response discusses `BUY / ADD / HOLD / REDUCE / EXIT`, that is a transparent, user-reviewed conclusion built on the memo—not an executable app action.
