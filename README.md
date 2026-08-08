# AI Berkshire ChatGPT App

A ChatGPT/MCP adaptation of [`xbtlin/ai-berkshire`](https://github.com/xbtlin/ai-berkshire), currently focused on **US-listed operating-company stocks only**.

> **Current direction:** stay close to how the original AI Berkshire repo works. ChatGPT gathers research from the web; the MCP app provides portfolio/thesis state and deterministic financial calculations. We are deliberately not building a market-data provider framework yet.

## Current workflow

```text
User: "Research GOOG"
        |
        v
ChatGPT web research
        |
        +-- Macrotrends
        +-- StockAnalysis
        +-- SEC 10-K / 10-Q / 8-K
        +-- Company investor relations
        +-- Web/news for competitors, management, risks, bull/bear cases
        |
        v
MCP financial-rigor tools
        |
        +-- verify_market_cap
        +-- validate_financial_metric
        +-- verify_valuation
        |
        v
ChatGPT investment reasoning
        |
        +-- business essence
        +-- moat
        +-- inversion / bear case
        +-- management
        +-- long-term industry position
        +-- valuation / margin of safety
        |
        v
Research memo
```

This intentionally mirrors the original repo's US-stock flow: the agent is the integration/research layer, while deterministic code checks important arithmetic.

## US-stock source policy

For material financial facts:

1. **Macrotrends** — main secondary source.
2. **StockAnalysis** — independent secondary cross-check.
3. **SEC EDGAR / company filings** — authoritative primary source when figures differ and for critical facts.
4. **Company investor relations** — earnings releases, presentations, management commentary.
5. General web/news research for qualitative context only.

Important metrics should be checked against at least two sources.

Discrepancy policy, following the original AI Berkshire written financial-data rules:

- `<= 1%` — pass;
- `> 1% and <= 5%` — warning; investigate units/accounting/timing;
- `> 5%` — fail; check SEC/company primary filing before continuing.

## What works today

### Portfolio / thesis

- `get_portfolio_snapshot`
- `get_thesis`
- `run_portfolio_diagnostics`
- `render_portfolio_dashboard`

The checked-in portfolio/thesis fixtures are fictional. Real holdings must not be committed to this public repo.

### Financial rigor

- `verify_market_cap`
  - exact `price × shares` calculation;
  - comparison with reported market cap;
  - pass/warning/fail discrepancy classification.

- `validate_financial_metric`
  - takes named source values, e.g. Macrotrends / StockAnalysis / SEC;
  - uses the exact median as the reference, matching the original repo's cross-validation approach;
  - applies the documented 1%/5% policy bands.

- `verify_valuation`
  - PE;
  - earnings yield;
  - PB;
  - ROE when EPS and book value are supplied;
  - P/FCF;
  - FCF yield;
  - dividend yield;
  - missing inputs remain missing.

All financial inputs and outputs use decimal strings and `decimal.js`; production financial calculations do not use JavaScript binary floating-point arithmetic.

## ChatGPT research sequence

For a US stock research request, the intended sequence is:

1. State the data cutoff date.
2. Rate information richness (A/B/C), following AI Berkshire.
3. Gather current and historical facts from Macrotrends and StockAnalysis.
4. Read the latest SEC filing / company IR material for primary-source confirmation.
5. Validate at minimum:
   - current price;
   - shares outstanding;
   - market cap;
   - annual revenue;
   - annual net income;
   - cash / short-term investments;
   - debt / net cash;
   - free cash flow.
6. Run the MCP financial-rigor tools.
7. Only then perform the Buffett / Munger / Duan Yongping / Li Lu qualitative analysis.
8. Separate `FACT`, `ANALYSIS`, and `UNCERTAINTY` in the final memo.
9. Include the strongest counterargument and what evidence would falsify the thesis.

## Architecture

```text
                 ChatGPT
                    |
          web search / browsing
                    |
      +-------------+-------------+
      |             |             |
 Macrotrends   StockAnalysis     SEC / IR
      |             |             |
      +-------------+-------------+
                    |
                    v
             collected facts
                    |
                    v
          AI Berkshire MCP app
                    |
       +------------+-------------+
       |                          |
 financial-rigor              portfolio /
 calculations                 thesis state
       |                          |
       +------------+-------------+
                    |
                    v
             ChatGPT reasoning
```

The MCP server is **not** currently responsible for scraping or storing Macrotrends, StockAnalysis, SEC, Yahoo, or news data.

## Why keep it simple

The original AI Berkshire repo already demonstrates that an agent can gather web information effectively. We should first prove that the same workflow works well inside ChatGPT before introducing:

- market-data provider abstractions;
- SEC ingestion services;
- evidence warehouses;
- caching pipelines;
- scheduled data collectors.

Those are optimizations, not requirements for the first useful version.

## Safety boundary

The application must not:

- place or route trades;
- turn a score directly into an execution instruction;
- buy because a price fell or sell because it rose;
- silently invent missing financial facts;
- continue past a major source discrepancy without checking primary evidence.

This is an investment research and decision-support application, not an autonomous trading system.

## Run locally

Requires Node.js 22+.

```bash
npm install
npm run typecheck
npm test
npm run build
npm start
```

MCP endpoint:

```text
http://localhost:8787/mcp
```

Inspect locally with:

```bash
npx @modelcontextprotocol/inspector@latest
```

For ChatGPT testing, expose port `8787` through HTTPS and connect ChatGPT Developer Mode to the resulting `/mcp` endpoint.

## Current milestone

See [Issue #1](https://github.com/wudong/ai-berkshire-chatgpt-app/issues/1): **Mirror original AI Berkshire US-stock research workflow**.

Next items:

1. test the three financial-rigor tools from ChatGPT;
2. add the original-style three-scenario valuation helper;
3. test one real US company end-to-end;
4. refine tool descriptions/prompts based on actual ChatGPT behavior;
5. only then decide whether any automated data adapter is necessary.

## Existing design docs

The earlier architecture/provider documents remain in `docs/` as longer-term design ideas, but **Issue #1 and this README define the current implementation direction**. Provider/evidence-store work is intentionally deferred.

## License

The source AI Berkshire project is MIT licensed. Preserve the original copyright/license notice when substantially adapting its code or documentation.
