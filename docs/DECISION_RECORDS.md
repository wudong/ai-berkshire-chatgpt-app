# Architecture Decision Records

This file records decisions that materially affect safety, reproducibility, or financial interpretation.

## ADR-001 — Read-only first

**Decision:** v1 exposes read-only MCP tools only.

**Reason:** validating evidence retrieval, arithmetic, and reasoning is more important than adding write convenience. It also prevents accidental mutation of portfolio/thesis state while the system is unvalidated.

## ADR-002 — No brokerage integration

**Decision:** no order placement, trade staging, or broker credentials.

**Reason:** the project is research/decision support. Execution adds a qualitatively different operational and financial risk surface.

## ADR-003 — Backend owns financial facts

**Decision:** sourced facts, units, currencies, timestamps, calculation inputs/results, portfolio snapshots, and thesis versions are backend-owned structured records.

**Reason:** model prose must not be the system of record for consequential data.

## ADR-004 — Model recommendations are not tool outputs

**Decision:** MCP data tools do not output magic buy/sell scores or trade actions.

**Reason:** qualitative investment judgments should remain transparent reasoning over evidence, assumptions, and portfolio context.

## ADR-005 — Decimal end-to-end

**Decision:** financial arithmetic uses decimal strings and a Decimal implementation end-to-end.

**Reason:** the source project's stated exactness is weakened by multiple conversions to binary floating point. We want calculation behavior that is testable and reproducible.

## ADR-006 — Primary-source-first provenance

**Decision:** important financial facts must carry source lineage; primary filings/exchange disclosures are preferred and secondary sources are cross-checks.

**Reason:** two websites can be correlated copies of one upstream feed. Source count alone is not verification.

## ADR-007 — Security-type-specific analysis

**Decision:** equity, ETF, and cash positions route through different research logic.

**Reason:** company metrics such as moat, ROE, and management quality do not meaningfully apply to an ETF in the same form.

## ADR-008 — Review triggers are not automatic actions

**Decision:** thesis red lines produce a review alert, not an automatic sell/reduce action.

**Reason:** a trigger may be false, incomplete, already priced, or require context outside the rubric.

## ADR-009 — Daily sentinel detects change only

**Decision:** daily monitoring looks for material evidence changes and data problems; it does not optimize or rebalance the portfolio daily.

**Reason:** daily price/news noise should not create systematic over-trading pressure.

## ADR-010 — Historical evaluation must be as-of

**Decision:** all historical/shadow evaluations enforce an evidence cutoff timestamp.

**Reason:** prevents look-ahead bias and makes evaluation reproducible.
