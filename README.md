# AI Berkshire ChatGPT App

A safety-first, auditable investment research and portfolio decision-support app inspired by the methodology in [`xbtlin/ai-berkshire`](https://github.com/xbtlin/ai-berkshire).

> **Status: design and validation phase.** No trade execution, brokerage integration, or automatic buy/sell actions will be implemented in v1.

## Goal

Build a ChatGPT/MCP application that helps a user:

- maintain explicit investment theses and falsifiable assumptions;
- collect and cross-check current financial evidence;
- review portfolio concentration, exposures, and opportunity cost;
- detect material changes in holdings without reacting to daily price noise;
- compare a new opportunity with existing holdings and cash;
- produce reproducible decision memos whose facts, calculations, assumptions, and sources are auditable.

The system is **research and decision support**, not an autonomous trading system.

## Safety boundary

The application must never:

- place, route, stage, or automatically recommend execution of a trade;
- convert a score directly into a buy/sell instruction;
- treat a price move by itself as evidence that a thesis changed;
- silently fill missing financial data with model estimates;
- rely on a single secondary data source for a material financial fact;
- present stale data as current;
- commit portfolio holdings, cost basis, credentials, API keys, or account identifiers to this repository.

## Source project

The original AI Berkshire project is MIT licensed. We will preserve the ideas that improve research discipline, while deliberately changing rules that are unsafe to mechanize for real-money decisions.

### Preserve

- fact / analysis / uncertainty separation;
- information-richness and data-gap awareness;
- explicit investment thesis and falsifiable assumptions;
- red-team / inversion analysis;
- source verification and exact calculations;
- thesis-change tracking;
- portfolio opportunity-cost thinking;
- daily event triage separated from deeper periodic review.

### Adapt or reject

- fixed concentration/cash ranges become configurable constraints, not defaults;
- thesis-health scores are diagnostic only and never map directly to trades;
- hard-coded risk-free rates are replaced by current, currency-specific benchmarks;
- simple `FCF yield + growth` is only one rough lens, never a stand-alone expected-return engine;
- analyst target prices are context, not valuation truth;
- price-move thresholds may trigger research, never a trading action;
- Benford checks are not used as a fraud verdict;
- all financial arithmetic must remain Decimal end-to-end without float conversion.

## Planned architecture

```text
ChatGPT / MCP client
        |
        v
MCP application server
        |
        +-- Portfolio snapshot service
        +-- Thesis/evidence service
        +-- Financial data adapters
        +-- Exact calculation engine
        +-- Event/change detector
        +-- Audit/provenance service
        |
        +-- React portfolio/research widgets
```

The backend owns facts and calculations. The model reasons over structured evidence packets.

## v1 tool surface

Read-only by design:

- `get_portfolio_snapshot`
- `get_thesis`
- `get_company_research_packet`
- `get_recent_events`
- `validate_financial_metric`
- `calculate_valuation_scenarios`
- `run_portfolio_diagnostics`
- render-only dashboard/detail tools

We intentionally do **not** start with an `evaluate_opportunity` tool that hides a recommendation inside backend logic. Opportunity evaluation is a transparent reasoning workflow over the above evidence.

## Documents

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system boundaries, data model, tool design, security, and auditability.
- [`docs/RESEARCH_POLICY.md`](docs/RESEARCH_POLICY.md) — adaptation of the AI Berkshire philosophy for real-money decision support.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — phased build and acceptance gates.

## ChatGPT availability note

The Apps SDK is open source, but custom app testing inside ChatGPT depends on ChatGPT Developer Mode availability. Current OpenAI documentation should be checked before deployment. The MCP server is deliberately portable so it can be validated with MCP tooling/Codex even before ChatGPT app access is available.

## Privacy

This repository may remain public for application code, but **real portfolio data must live outside Git**. If private fixtures or thesis content are ever required for development, move the repository to private or use a separate private data store/repository.

## License

This project will include the original AI Berkshire MIT notice when code or substantial documentation is adapted from it. New code in this repository will use an explicit license before public distribution.