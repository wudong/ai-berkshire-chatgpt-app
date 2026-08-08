# Open Questions Before Live Data

These questions intentionally remain unresolved until the deterministic/MCP scaffold is working. None blocks the mocked v1 milestone.

## 1. ChatGPT Developer Mode access

Current OpenAI documentation must be rechecked immediately before ChatGPT integration testing. The Apps SDK is open source, but Developer Mode/custom-app availability depends on plan/workspace and can change.

## 2. Market-data provider

Do not choose solely on API convenience.

Evaluate:

- personal-use licensing;
- price and rate limits;
- real-time vs delayed quotes;
- adjusted/unadjusted history semantics;
- shares-outstanding quality;
- corporate-action coverage;
- ETF metadata;
- symbol/exchange identity quality;
- uptime and support;
- source lineage.

## 3. Persistent private storage

Candidates should be compared on:

- encryption and authentication;
- backup/export;
- cost for a personal deployment;
- schema migration support;
- deployment complexity;
- ability to reproduce historical snapshots.

The domain layer must not depend on this choice.

## 4. Authentication

For local/MCP-inspector development, no user auth may be needed. A remotely reachable personal MCP server should not be left open.

Before deployment choose a supported authentication pattern based on current ChatGPT Apps/MCP documentation.

## 5. Initial market scope

Recommended technical sequence is US equities + US ETFs first, but actual scope should be decided from the instruments the owner intends to track. Each additional market requires explicit source, currency, accounting, corporate-action, and identifier tests.

## 6. Portfolio import

Potential future inputs:

- manual structured portfolio entry;
- private CSV import;
- private spreadsheet/data store;
- broker export file.

Direct broker API connectivity is intentionally out of scope for initial releases.

## 7. Valuation models

Start with transparent scenario models. Add DCF only when:

- cash-flow definitions are normalized;
- discount-rate inputs have explicit sources/assumptions;
- terminal value assumptions are visible;
- sensitivity output is mandatory;
- historical/unit tests exist.

## 8. Model-side methodology delivery

Evaluate the best current Apps SDK mechanism for making the research policy consistently available to ChatGPT without bloating every tool response. Options may include tool descriptions, MCP resources, structured research packets, or an app-specific workflow entry point. Follow current OpenAI docs at implementation time.

## 9. Daily sentinel hosting

Prefer a backend scheduler independent of ChatGPT scheduled-task limitations. Hosting selection should occur after the data provider and persistent store are known.
