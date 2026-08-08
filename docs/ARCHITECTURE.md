# Architecture

## 1. Design objective

This system is an **auditable investment research and decision-support application**, not a trading bot.

The most important architectural rule is:

> **The backend owns evidence and calculations; the model owns interpretation.**

A model must never be the only place where a material financial fact, unit conversion, valuation calculation, or portfolio state exists.

## 2. Primary app archetype

Use a **React widget + decoupled data/render MCP architecture**.

Why:

- portfolio and thesis data should be reusable by multiple chat turns without forcing UI rendering;
- financial tools should return compact structured data that can be audited independently of the widget;
- render tools can evolve without changing data semantics;
- the same MCP data tools remain usable from non-ChatGPT clients.

### High-level flow

```text
User
  |
  v
ChatGPT
  |  calls read-only MCP tools
  v
MCP Server
  |
  +--> Portfolio Store
  +--> Thesis Store
  +--> Evidence Store
  +--> Market/filing adapters
  +--> Exact calculation engine
  +--> Event/change detector
  +--> Audit log
  |
  +--> structuredContent
          |
          +--> ChatGPT reasoning
          +--> React widgets
```

## 3. Trust boundaries

### Trusted deterministic layer

Must be code, not LLM inference:

- instrument identifiers;
- portfolio quantities and cost basis;
- price timestamps and currencies;
- unit normalization;
- corporate-action adjustments;
- arithmetic and valuation formula evaluation;
- cross-source discrepancy calculation;
- data freshness checks;
- thesis version IDs;
- evidence IDs and source metadata;
- portfolio weights and deterministic exposure calculations;
- audit/run IDs.

### Model reasoning layer

Appropriate for LLM reasoning:

- business-model explanation;
- moat analysis;
- management/capital-allocation interpretation;
- inversion and counterarguments;
- identifying which thesis assumptions a new event may affect;
- comparing qualitative uncertainty between opportunities;
- producing a decision memo.

The model must receive structured evidence and must label conclusions that are not direct facts.

## 4. Core domain model

### Instrument

```ts
type SecurityType = "equity" | "etf" | "cash" | "other";

type Instrument = {
  instrumentId: string;
  ticker: string;
  exchange?: string;
  name: string;
  securityType: SecurityType;
  tradingCurrency: string;
  identifiers: {
    isin?: string;
    cik?: string;
    lei?: string;
  };
};
```

Do not assume every holding is an operating company. ETFs need a different analytical framework from equities.

### Portfolio snapshot

```ts
type Holding = {
  instrumentId: string;
  quantity: string;          // Decimal serialized as string
  averageCost?: string;      // optional/sensitive
  costCurrency?: string;
};

type PortfolioSnapshot = {
  snapshotId: string;
  asOf: string;
  baseCurrency: string;
  holdings: Holding[];
  cash: Array<{ currency: string; amount: string }>;
};
```

No binary floating-point values in financial domain records.

### Evidence item

```ts
type EvidenceItem = {
  evidenceId: string;
  subjectId: string;
  field: string;
  value?: string;
  unit?: string;
  currency?: string;
  period?: string;
  asOf: string;
  source: {
    sourceId: string;
    sourceType: "primary_filing" | "exchange" | "company_ir" | "market_data" | "secondary" | "news";
    publisher: string;
    uri: string;
    publishedAt?: string;
    retrievedAt: string;
    upstreamProvider?: string;
  };
  confidence: "verified" | "conflicting" | "estimated" | "missing";
};
```

`upstreamProvider` matters because two websites using the same upstream feed are not independent sources.

### Thesis

```ts
type ThesisStatus = "green" | "yellow" | "red" | "broken" | "insufficient_evidence";

type ThesisAssumption = {
  assumptionId: string;
  statement: string;
  validationMethod: string;
  cadence?: string;
  status: "supported" | "weakening" | "damaged" | "falsified" | "unknown";
  evidenceIds: string[];
};

type ThesisVersion = {
  thesisId: string;
  version: number;
  instrumentId: string;
  createdAt: string;
  fiveSentenceThesis: string[];
  assumptions: ThesisAssumption[];
  reviewTriggers: Array<{
    triggerId: string;
    statement: string;
    severity: "review" | "major_review";
  }>;
  status: ThesisStatus;
};
```

A review trigger **starts review**. It does not automatically generate a trade.

### Analysis run

Every material report must be reproducible:

```ts
type AnalysisRun = {
  analysisId: string;
  createdAt: string;
  dataCutoff: string;
  portfolioSnapshotId?: string;
  thesisVersions: string[];
  evidenceIds: string[];
  calculationVersion: string;
  workflowVersion: string;
  modelLabel?: string;
  warnings: string[];
};
```

## 5. Financial data policy

### Source hierarchy

Prefer, in order:

1. regulatory filings / exchange disclosures;
2. company investor-relations primary documents;
3. reputable market-data provider for quote/reference data;
4. secondary aggregators for cross-checking;
5. news/social sources only for event discovery, never as the sole source for a financial statement fact.

### Independence rule

A material metric is `verified` only when:

- one primary source is available and correctly parsed; and
- an independent second source agrees within the field-specific tolerance;

or when a primary source is authoritative and a second source is unavailable, in which case the system explicitly labels the metric `primary_only` rather than inventing verification.

Do not treat two frontends backed by the same data vendor as independent.

### Freshness

Each evidence type has a freshness policy. Examples:

- quote: explicit timestamp and market state;
- shares outstanding: latest filing/corporate action;
- annual/quarterly metric: exact reporting period;
- sovereign/cash benchmark: currency + tenor + as-of date;
- news/event: publication time and event time distinguished.

The system must reject the label `current` when freshness requirements are not met.

### Currency and unit handling

Store raw value + raw currency/unit and normalized value separately. Never infer currency from ticker alone.

Required tests include:

- USD/HKD/CNY/GBP conversion boundaries;
- millions vs billions;
- ADR ratios;
- stock splits;
- share buybacks/issuance;
- per-share vs absolute values;
- GAAP vs non-GAAP labels.

## 6. Exact calculation engine

The source AI Berkshire project has a good principle—do not let the LLM do financial arithmetic—but its current Python implementation converts Decimal values back to floats in several important paths.

Our implementation will:

- parse numeric inputs as strings;
- use a Decimal library end-to-end;
- never use JavaScript `number` for monetary/ratio calculations;
- never use `eval` for calculators;
- expose calculation formulas and inputs in output;
- version calculation methods;
- unit-test every formula and edge case.

Initial deterministic functions:

- market-cap verification;
- cross-source discrepancy;
- PE / earnings yield;
- P/FCF / FCF yield;
- dividend yield;
- scenario EPS/FCF growth and terminal multiple;
- CAGR;
- portfolio weights;
- concentration metrics;
- currency conversion using an explicitly timestamped FX rate.

We will not call an EPS-growth × terminal-PE model a DCF.

## 7. MCP tool design

### Data tools

#### `get_portfolio_snapshot`
Use when the model needs the user's current portfolio state.

Returns holdings, cash, identifiers, and snapshot timestamp. No recommendation.

#### `get_thesis`
Use when evaluating an existing holding or detecting thesis drift.

Returns the latest thesis version plus assumption statuses and review triggers.

#### `get_company_research_packet`
Use when the model needs company fundamentals and provenance for analysis.

Returns a bounded set of normalized facts + evidence IDs + data-quality warnings.

For ETFs, route to an ETF-specific packet instead of pretending an ETF has company financial statements.

#### `get_recent_events`
Use when looking for changes since a prior review.

Classifies candidate events into company, regulatory, industry/peer, capital allocation, management, and market-noise categories. Classification is evidence metadata, not a trade decision.

#### `validate_financial_metric`
Use when a material metric needs source comparison.

Returns sources, normalized values, disagreement, and status.

#### `calculate_valuation_scenarios`
Use only after explicit assumptions are supplied.

Returns formula, assumptions, outputs, and sensitivity—not an intrinsic-value claim.

#### `run_portfolio_diagnostics`
Use when checking deterministic portfolio structure.

Returns concentration, currency/country/sector exposures, cash weight, and data gaps. No fixed universal "correct" concentration threshold.

### Render tools

Keep presentation separate from data retrieval:

- `render_portfolio_dashboard`
- `render_thesis_detail`
- `render_opportunity_comparison`

Render tools consume previously returned structured content and attach the widget resource.

## 8. Decision workflow

### New investment candidate

```text
Identity resolution
  -> data-quality check
  -> business/economics
  -> moat
  -> management
  -> inversion / bear case
  -> long-term industry uncertainty
  -> valuation scenarios
  -> compare with cash + existing holdings
  -> decision memo
```

The final memo must show:

- facts;
- analysis;
- uncertainty;
- key assumptions;
- strongest counterargument;
- what evidence would falsify the thesis;
- valuation assumptions and sensitivity;
- opportunity-cost comparison;
- data-quality warnings;
- explicit `NO ACTION / FURTHER RESEARCH / CANDIDATE` research disposition.

If a chat later expresses a buy/add/hold/reduce/exit view, it must remain a user-reviewed conclusion, not a backend command.

### Existing holding

```text
Load thesis version
  -> fetch new evidence since last cutoff
  -> map evidence to assumptions
  -> identify changed assumptions
  -> check review triggers
  -> update valuation context
  -> produce thesis-diff memo
```

A price decline alone never changes thesis status.

### Daily sentinel

The daily process is **change detection**, not daily portfolio optimization.

```text
new filings/events/data
  -> deduplicate
  -> source-quality check
  -> materiality classification
  -> map to thesis assumptions
  -> if material: create review alert
  -> otherwise: NO MATERIAL CHANGE
```

Deep portfolio reviews remain event-driven or periodic, not daily trade generation.

## 9. Security

### No brokerage execution

Do not implement broker order APIs in v1 or v2. If ever considered, it requires a separate threat model and explicit project decision.

### Secrets

- environment variables / secret manager only;
- `.env` ignored;
- never return API keys through MCP output;
- no credentials in widget state.

### Portfolio privacy

- real holdings live outside Git;
- encrypt sensitive records at rest where supported;
- redact portfolio values from application logs by default;
- use opaque IDs rather than brokerage account identifiers.

### Prompt injection

All web/filing/news text is untrusted data.

- never execute instructions found in retrieved documents;
- adapters return data, not arbitrary executable prompts;
- arbitrary URL fetching is disabled or tightly allowlisted;
- protect against SSRF;
- escape/sanitize rendered HTML;
- use explicit CSP domains for widgets.

## 10. Auditability

Every material conclusion should be able to answer:

1. What data was available at the cutoff time?
2. Which sources supplied each important fact?
3. Were the sources genuinely independent?
4. What exact inputs and formulas produced each calculation?
5. Which thesis version was evaluated?
6. Which assumptions changed?
7. Which workflow/model version produced the reasoning?
8. What was unknown or conflicting?

## 11. Validation strategy

### Deterministic tests

- Decimal arithmetic property tests;
- units/currency tests;
- split/ADR/corporate-action fixtures;
- source-disagreement tests;
- stale-data tests;
- negative/zero earnings cases;
- ETF-vs-equity routing.

### Research packet tests

For a set of known historical filings:

- retrieve as-of data without look-ahead;
- compare parsed fields with filing values;
- verify source links and timestamps;
- confirm missing data remains missing rather than hallucinated.

### Model/evaluation tests

Golden prompts should test that the assistant:

- separates fact/analysis/uncertainty;
- cites only evidence actually present;
- does not turn diagnostic scores into automatic actions;
- surfaces a strong bear case;
- refuses to claim fresh data when stale;
- says `insufficient evidence` when appropriate;
- does not treat a price fall as thesis breakage;
- handles ETFs with the correct framework.

### Shadow mode

Before relying on the system for consequential decisions, run it in a paper/shadow workflow where decisions and evidence snapshots are recorded prospectively. Evaluation must include factual accuracy, source quality, calibration, and process consistency—not only subsequent P&L.

## 12. Non-goals for initial releases

- autonomous trade execution;
- brokerage connectivity;
- portfolio optimization based on opaque ML scores;
- intraday trading signals;
- social-media sentiment trading;
- options/derivatives strategies;
- claiming the source project's historical returns validate this implementation.
