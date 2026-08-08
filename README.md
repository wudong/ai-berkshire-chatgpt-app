# AI Berkshire ChatGPT App

A safety-first, auditable investment research and portfolio decision-support app inspired by the methodology in [`xbtlin/ai-berkshire`](https://github.com/xbtlin/ai-berkshire).

> **Status: first runnable proof-of-concept implemented.** The TypeScript MCP server, exact Decimal calculation core, fictional fixtures, read-only tools, React dashboard, tests, and CI are working. No trade execution, brokerage integration, or automatic buy/sell actions will be implemented in v1.

## Goal

Build a ChatGPT/MCP application that helps a user:

- maintain explicit investment theses and falsifiable assumptions;
- collect and cross-check current financial evidence;
- review portfolio concentration, exposures, and opportunity cost;
- detect material changes in holdings without reacting to daily price noise;
- compare a new opportunity with existing holdings and cash;
- produce reproducible decision memos whose facts, calculations, assumptions, and sources are auditable.

The system is **research and decision support**, not an autonomous trading system.

## What works today

The current proof-of-concept implements:

- TypeScript MCP server over Streamable HTTP at `/mcp`;
- MCP Apps-compatible React portfolio dashboard;
- repository interfaces with fictional fixture implementations;
- decimal-string financial domain records;
- `decimal.js` arithmetic with no binary floating-point portfolio calculations;
- deterministic portfolio weights and concentration diagnostics;
- exact market-cap and cross-source discrepancy helpers;
- thesis records with five-sentence thesis, assumptions, statuses, and review triggers;
- GitHub Actions validation for typecheck, tests, and server/widget builds.

Current MCP tools:

- `get_portfolio_snapshot` — data only;
- `get_thesis` — data only;
- `run_portfolio_diagnostics` — deterministic calculations only;
- `render_portfolio_dashboard` — presentation only.

The checked-in data under `fixtures/` is fictional. It exists only to exercise the application flow.

### Run locally

Requires Node.js 22+.

```bash
npm install
npm run typecheck
npm test
npm run build
npm start
```

The MCP endpoint is then:

```text
http://localhost:8787/mcp
```

You can inspect it with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
```

For ChatGPT testing, expose port `8787` through an HTTPS tunnel and connect ChatGPT Developer Mode to the resulting `https://.../mcp` endpoint.

Current OpenAI documentation:

- https://developers.openai.com/plugins/build/app-quickstart
- https://developers.openai.com/plugins/build/mcp-server
- https://developers.openai.com/plugins/build/chatgpt-ui
- https://developers.openai.com/plugins/plan/tools

## Safety boundary

The application must never:

- place, route, stage, or automatically recommend execution of a trade;
- convert a score directly into a buy/sell instruction;
- treat a price move by itself as evidence that a thesis changed;
- silently fill missing financial data with model estimates;
- rely on a single secondary data source for a material financial fact;
- present stale data as current;
- commit real portfolio holdings, cost basis, credentials, API keys, or account identifiers to this repository.

## Source project

The original AI Berkshire project is MIT licensed. We preserve the ideas that improve research discipline, while deliberately changing rules that are unsafe to mechanize for real-money decisions.

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
- all financial arithmetic remains Decimal end-to-end without float conversion.

## Architecture

```text
ChatGPT / MCP client
        |
        v
MCP application server
        |
        +-- Portfolio repository
        +-- Thesis repository
        +-- Evidence store             (next phase)
        +-- Market/filing adapters     (next phase)
        +-- Exact calculation engine
        +-- Event/change detector      (later)
        +-- Audit/provenance service   (later)
        |
        +-- React portfolio/research widgets
```

The backend owns facts and calculations. The model reasons over structured evidence packets.

## v1 tool surface

Read-only by design. The complete intended surface is:

- `get_portfolio_snapshot` ✅
- `get_thesis` ✅
- `run_portfolio_diagnostics` ✅
- `render_portfolio_dashboard` ✅
- `get_company_research_packet` — planned;
- `get_recent_events` — planned;
- `validate_financial_metric` — planned MCP exposure (calculation core started);
- `calculate_valuation_scenarios` — planned;
- additional render-only thesis/opportunity views — planned.

We intentionally do **not** start with an `evaluate_opportunity` tool that hides a recommendation inside backend logic. Opportunity evaluation is a transparent reasoning workflow over evidence and calculations.

## Documents

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system boundaries, data model, tool design, security, and auditability.
- [`docs/RESEARCH_POLICY.md`](docs/RESEARCH_POLICY.md) — adaptation of the AI Berkshire philosophy for real-money decision support.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — phased build and acceptance gates.

## Next milestone

The next build phase is the **evidence/provider layer**, starting narrowly with US-listed equities and ETFs:

1. instrument identity resolution;
2. SEC/company-IR primary-source retrieval;
3. source provenance and freshness metadata;
4. a market-data provider with explicit quote timestamps/delay status;
5. independent-source validation for material metrics;
6. `get_company_research_packet` and `validate_financial_metric` MCP tools.

Only after those facts are trustworthy should we add valuation scenarios and higher-level opportunity comparison workflows.

## ChatGPT availability note

The Apps SDK is open source, but custom app testing inside ChatGPT depends on ChatGPT Developer Mode availability. Check current OpenAI documentation before deployment. The MCP server is deliberately portable so it can also be validated with standard MCP tooling.

## Privacy

This repository may remain public for application code, but **real portfolio data must live outside Git**. If private fixtures or thesis content are required for development, use a private state store/repository instead of committing them here.

## License

This project will include the original AI Berkshire MIT notice when code or substantial documentation is adapted from it. New code in this repository should receive an explicit license before public distribution.
