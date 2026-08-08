# Implementation Plan

## Guiding rule

Do not build the recommendation layer first.

Build in this order:

1. schemas and provenance;
2. exact calculations;
3. source adapters and validation;
4. portfolio/thesis storage;
5. MCP data tools;
6. model-facing research workflow;
7. widget UI;
8. daily sentinel;
9. shadow-mode evaluation.

Each phase has an acceptance gate. A later phase must not compensate for a failed earlier gate with more prompting.

---

## Phase 0 — Design baseline

### Deliverables

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/RESEARCH_POLICY.md`
- this implementation plan
- source-project review and explicit list of preserved/adapted/rejected behavior

### Decisions locked for v1

- TypeScript backend;
- React widget;
- MCP / Apps SDK architecture;
- decoupled data tools and render tools;
- read-only app tools;
- no broker connectivity;
- no automatic buy/sell action;
- no private portfolio data in Git;
- deterministic Decimal arithmetic;
- source provenance on every material fact;
- security-type-aware analysis (equity vs ETF vs cash).

### Acceptance gate

Architecture must make it impossible for a model hallucination to silently become stored portfolio state or an executed transaction.

---

## Phase 1 — Repository scaffold and deterministic core

### Proposed repository tree

```text
ai-berkshire-chatgpt-app/
├── apps/
│   ├── mcp-server/
│   │   └── src/
│   └── widget/
│       └── src/
├── packages/
│   ├── domain/
│   ├── calculations/
│   ├── evidence/
│   ├── providers/
│   └── test-fixtures/
├── docs/
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

Keep the first scaffold small. Avoid premature framework/ORM complexity.

### `packages/domain`

Implement Zod/TypeScript schemas for:

- Instrument;
- PortfolioSnapshot;
- Holding;
- EvidenceItem;
- ThesisVersion;
- ThesisAssumption;
- AnalysisRun;
- ValuationScenario;
- DataQualityWarning.

All financial numeric fields serialize as decimal strings.

### `packages/calculations`

Use a decimal arithmetic library and never convert domain values to binary floating point.

Implement:

- `verifyMarketCap`;
- `crossValidateMetric`;
- `peRatio` / `earningsYield`;
- `pFcf` / `fcfYield`;
- `dividendYield`;
- `cagr`;
- `scenarioValue`;
- `portfolioWeights`;
- `concentrationMetrics`;
- explicit FX conversion helper with timestamped rate input.

No `eval`-based calculator.

### Source-project defects explicitly fixed

The original `financial_rigor.py`:

- converts Decimal values to `float` in discrepancy, median, formatting, and scenario output paths;
- accepts CLI financial numbers as `float` before converting them to Decimal;
- uses a 2% default cross-validation tolerance while the written financial-data policy says >1% should be flagged;
- describes all calculations as exact despite these conversions;
- accepts `shares` in the three-scenario EPS × PE function without using it;
- uses Python `eval` for the generic calculator;
- includes Benford analysis that must not be treated as a fraud detector.

Our tests should capture these cases so they cannot regress.

### Tests

- decimal precision and rounding;
- zero/negative values;
- very large share counts;
- unit mismatch;
- percentage-vs-ratio input;
- cross-source exact-threshold behavior;
- stock split fixture;
- ADR ratio fixture;
- multi-currency fixture.

### Acceptance gate

All calculations reproduce expected values from hand-verified fixtures, and no production calculation path uses binary floating-point arithmetic.

---

## Phase 2 — Evidence and provider layer

### Provider interfaces first

Do not bind the domain to one finance website.

```ts
interface FilingProvider { ... }
interface MarketDataProvider { ... }
interface CorporateActionProvider { ... }
interface FxProvider { ... }
interface EventProvider { ... }
```

### Initial market scope

Start with a narrow, well-tested scope rather than claiming global support.

Recommended first scope:

- US-listed equities;
- US-listed ETFs;
- cash balances.

Add UK/HK/CN/TW market adapters only after each market's primary-source, currency, corporate-action, and identifier rules are explicitly implemented.

### Primary-source adapters

For US operating companies:

- SEC company identity/CIK resolution;
- 10-K/10-Q facts and filing links;
- company IR documents when needed.

For ETFs:

- issuer/index documents;
- fee/index/holdings metadata;
- fund-specific rather than company-financial analysis.

### Market price provider

Select only after reviewing:

- licensing/terms for personal app use;
- quote delay/real-time status;
- corporate-action handling;
- adjusted/unadjusted history;
- symbol/exchange coverage;
- API reliability and rate limits.

The app must expose the quote's timestamp and delay status.

### Source independence

Implement a source-lineage registry. Two sources count as independent only when they do not share the same upstream data feed for the relevant metric.

### Acceptance gate

For every supported instrument in a fixed test set, the application can produce a research packet whose material numeric fields have correct period, unit, currency, source link, retrieval timestamp, and quality status.

---

## Phase 3 — Private state layer

### Repository interfaces

```ts
interface PortfolioRepository { ... }
interface ThesisRepository { ... }
interface EvidenceRepository { ... }
interface AnalysisRunRepository { ... }
```

Start with an in-memory/test implementation. Add persistent storage behind interfaces.

### Persistence requirements

- no portfolio data in Git;
- opaque IDs;
- versioned thesis records;
- immutable evidence snapshots where practical;
- analysis run references exact snapshot/evidence versions;
- schema migrations;
- backup/export path.

### Sensitive fields

Treat as private:

- quantities;
- cost basis;
- total portfolio value;
- account/broker identifiers;
- private thesis notes.

Logs should omit these values unless explicitly enabled for local debugging.

### Acceptance gate

A historical analysis run can be reproduced against the same stored portfolio/thesis/evidence snapshot without reading current data.

---

## Phase 4 — MCP server

### Transport

Expose a remote `/mcp` endpoint compatible with the current Apps SDK/MCP requirements.

### Initial read-only tools

#### 1. `get_portfolio_snapshot`

Input: optional portfolio ID.

Output:

- snapshot ID;
- as-of timestamp;
- holdings/cash;
- instrument metadata;
- privacy-safe warnings.

Annotations: read-only, non-destructive.

#### 2. `get_thesis`

Input: instrument ID.

Output latest thesis version, assumptions, review triggers, and evidence references.

#### 3. `get_security_research_packet`

Input: instrument ID + requested cutoff.

Output:

- identity;
- security type;
- normalized fundamentals/fund metadata;
- valuation inputs;
- source provenance;
- freshness/conflict warnings.

Never hide missing data.

#### 4. `get_recent_events`

Input: instrument ID + since timestamp.

Output classified candidate events with source metadata and materiality evidence.

Do not emit buy/sell actions.

#### 5. `validate_financial_metric`

Input: metric ID / evidence IDs.

Output source comparison, tolerance result, and discrepancy explanation requirement.

#### 6. `calculate_valuation_scenarios`

Input: explicit scenario assumptions.

Output formula + inputs + outputs + sensitivity.

#### 7. `run_portfolio_diagnostics`

Input: snapshot ID.

Output deterministic concentration/exposure metrics and data gaps.

### Tool naming principle

Prefer names that describe evidence/data operations. Avoid tools named `buy_signal`, `sell_signal`, or `decide_trade`.

### Standard search/fetch

Add MCP-standard `search` / `fetch` over the app's own evidence/document corpus if needed for deep research/company-knowledge flows. They are not required for v1 custom tools.

### Acceptance gate

- `/mcp` responds correctly;
- tool schemas are stable and machine-friendly;
- repeated read calls are idempotent;
- all tools return bounded `structuredContent`;
- tool annotations correctly declare read-only behavior;
- no tool can mutate portfolio state or execute a transaction.

---

## Phase 5 — Research workflow and reasoning contract

### Important architecture choice

Do not call a hidden backend function `evaluateOpportunity()` that outputs a magic recommendation score.

Instead, ChatGPT receives:

- portfolio facts;
- thesis;
- research packet;
- deterministic diagnostics;
- explicit valuation scenarios;
- research policy.

Then it builds a transparent memo.

### Equity workflow

1. identity/data-quality check;
2. business economics;
3. moat evidence and trend;
4. management/capital allocation;
5. inversion / bear case;
6. long-term industry uncertainty;
7. valuation scenarios;
8. compare with cash/existing holdings;
9. disposition + falsification criteria.

### ETF workflow

1. index objective/methodology;
2. holdings concentration and overlap;
3. factor/sector/country/currency exposures;
4. fee and tracking characteristics;
5. liquidity;
6. valuation context of underlying basket where reliable;
7. portfolio role/opportunity cost.

### Output schema

Require:

- data cutoff;
- evidence quality;
- facts;
- analysis;
- uncertainty;
- thesis status;
- strongest counterargument;
- valuation assumptions;
- opportunity-cost comparison;
- what would change the view;
- research disposition.

### Acceptance gate

Adversarial evals confirm the reasoning layer does not:

- invent missing metrics;
- cite absent evidence;
- treat a falling price as thesis failure;
- map a health score mechanically to a trade;
- apply company financial metrics to ETFs;
- claim stale data is current;
- suppress contradictory source evidence.

---

## Phase 6 — React UI

### First widgets

#### Portfolio dashboard

Show:

- data cutoff;
- holdings and weights;
- thesis status;
- evidence-quality status;
- review-needed flags;
- concentration/exposure summaries;
- cash;
- material data warnings.

Avoid red/green visual design that implies "sell/buy" solely from price movement.

#### Thesis detail

Show:

- five-sentence thesis;
- assumptions;
- evidence for each assumption;
- changed assumptions;
- review triggers;
- thesis history.

#### Opportunity comparison

Show candidate next to:

- cash benchmark;
- selected existing holdings;
- valuation scenario ranges;
- evidence quality;
- major uncertainty.

### UI safety

- sources open visibly;
- stale/conflicting data is prominent;
- assumptions are editable only in a later write-enabled phase;
- no trade/execution buttons.

### Acceptance gate

The widget is a faithful visualization of structured tool output and does not create additional financial facts client-side.

---

## Phase 7 — Daily sentinel

### Purpose

Detect material changes, not generate daily trades.

### Backend workflow

```text
scheduler
 -> refresh supported evidence
 -> detect new filings/events
 -> deduplicate
 -> map event to thesis assumptions
 -> materiality check
 -> create alert record
```

### Alert classes

- `NO_MATERIAL_CHANGE`;
- `REVIEW_SUGGESTED`;
- `MAJOR_REVIEW_REQUIRED`;
- `DATA_CONFLICT`;
- `DATA_STALE`.

No `BUY_NOW` / `SELL_NOW` alert class.

### Scheduler independence

Do not make daily monitoring depend on ChatGPT scheduled tasks being able to load project files or invoke a custom app. A backend scheduler keeps the evidence refresh reliable; ChatGPT consumes the resulting alerts when available.

### Acceptance gate

Historical event fixtures show that the sentinel distinguishes new fundamental evidence from duplicate articles and ordinary price noise.

---

## Phase 8 — Shadow-mode validation

Before treating the system as consequential decision support, validate it prospectively without automation.

### What to record

- exact analysis cutoff;
- evidence snapshot;
- thesis status;
- model/workflow version;
- disposition;
- assumptions;
- uncertainty;
- later outcome only as a secondary evaluation field.

### Evaluation dimensions

1. factual accuracy;
2. source quality and independence;
3. calculation correctness;
4. look-ahead leakage;
5. missing-data honesty;
6. thesis-change precision/recall;
7. counterargument quality;
8. consistency across repeated analyses;
9. calibration of confidence;
10. subsequent P&L, explicitly treated as noisy and not proof of process quality.

### Acceptance gate

No move to stronger decision language until the process has demonstrated reliable factual/calc behavior on the intended markets and security types.

---

## Phase 9 — Optional write features

Only after read-only behavior is validated and the ChatGPT plan/product supports the required MCP permissions.

Possible writes:

- save a new thesis version;
- record a user-approved decision journal entry;
- acknowledge a review alert.

Still excluded:

- broker order placement;
- autonomous portfolio rebalancing;
- automated trade execution.

Every write must be explicit, idempotent where possible, audited, and confirmation-friendly.

---

## OpenAI product constraints to account for

Current OpenAI documentation describes Apps SDK as preview/open source. Custom app testing in ChatGPT depends on Developer Mode. Current documentation explicitly mentions Pro users for read/fetch MCP access and Business/Enterprise/Edu for full MCP write/modify support; product availability can change.

Therefore:

- keep v1 read-only;
- keep the MCP server portable;
- validate with MCP tooling/Codex independently of the ChatGPT UI;
- check current Developer Mode availability again before integration testing;
- do not design core persistence around ChatGPT conversation/project storage.

---

## First implementation milestone

The first code milestone should contain **no live market-data provider and no real portfolio data**.

It should prove only:

1. domain schemas;
2. Decimal calculation correctness;
3. mocked evidence/provenance;
4. mocked portfolio/thesis data;
5. MCP tool descriptors and handlers;
6. one simple React portfolio widget;
7. tests demonstrating the safety boundaries.

After that passes, integrate one primary-source data path at a time.
