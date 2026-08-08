import { describe, expect, it } from "bun:test";
import {
  crossValidateMetric,
  earningsYieldPct,
  portfolioDiagnostics,
  validateFinancialMetric,
  verifyMarketCap,
  verifyValuation
} from "./calculations.js";
import type { PortfolioSnapshot } from "./types.js";

describe("exact financial calculations", () => {
  it("keeps a low-level discrepancy exactly at the tolerance consistent", () => {
    const result = crossValidateMetric("99", "100", "1");
    expect(result.discrepancyPct).toBe("1.000000");
    expect(result.status).toBe("consistent");
  });

  it("flags a low-level discrepancy above the tolerance", () => {
    const result = crossValidateMetric("98.9", "100", "1");
    expect(result.discrepancyPct).toBe("1.100000");
    expect(result.status).toBe("conflicting");
  });

  it("multiplies very large market-cap inputs without binary-float loss", () => {
    const result = verifyMarketCap(
      "123.456789",
      "9876543210",
      "1219326311126.352690",
      "USD"
    );
    expect(result.calculatedMarketCap).toBe("1219326311126.35269");
    expect(result.discrepancyPct).toBe("0.000000");
    expect(result.status).toBe("pass");
  });

  it("applies AI Berkshire market-cap warning and fail bands", () => {
    const warning = verifyMarketCap("100", "100", "9800", "USD");
    const fail = verifyMarketCap("100", "100", "9000", "USD");

    expect(warning.status).toBe("warning");
    expect(fail.status).toBe("fail");
  });

  it("uses the exact median and passes sources at exactly 1% deviation", () => {
    const result = validateFinancialMetric(
      "revenue",
      { Macrotrends: "99", StockAnalysis: "101" },
      "USDm"
    );

    expect(result.referenceMedian).toBe("100");
    expect(result.maxDeviationPct).toBe("1.000000");
    expect(result.status).toBe("pass");
  });

  it("warns when source deviation is above 1% and at most 5%", () => {
    const result = validateFinancialMetric(
      "net income",
      { Macrotrends: "98", StockAnalysis: "102" },
      "USDm"
    );

    expect(result.maxDeviationPct).toBe("2.000000");
    expect(result.status).toBe("warning");
  });

  it("fails when source deviation is above 5%", () => {
    const result = validateFinancialMetric(
      "free cash flow",
      { Macrotrends: "94", StockAnalysis: "106" },
      "USDm"
    );

    expect(result.maxDeviationPct).toBe("6.000000");
    expect(result.status).toBe("fail");
  });

  it("requires at least two sources for financial validation", () => {
    expect(() =>
      validateFinancialMetric("revenue", { SEC: "100" }, "USDm")
    ).toThrow("at least two independent sources");
  });

  it("calculates earnings yield as a decimal-string percentage", () => {
    expect(earningsYieldPct("5", "125")).toBe("4.000000");
  });

  it("mirrors the original valuation verification helper", () => {
    const result = verifyValuation({
      price: "100",
      eps: "5",
      bookValuePerShare: "25",
      fcfPerShare: "4",
      dividendPerShare: "2"
    });

    expect(result.pe).toBe("20.000000");
    expect(result.earningsYieldPct).toBe("5.000000");
    expect(result.pb).toBe("4.000000");
    expect(result.roePct).toBe("20.000000");
    expect(result.pFcf).toBe("25.000000");
    expect(result.fcfYieldPct).toBe("4.000000");
    expect(result.dividendYieldPct).toBe("2.000000");
  });

  it("does not invent valuation metrics when inputs are missing", () => {
    const result = verifyValuation({ price: "100" });
    expect(result).toEqual({
      price: "100",
      calculationVersion: "0.2.0"
    });
  });

  it("calculates portfolio weights from reference values exactly", () => {
    const snapshot: PortfolioSnapshot = {
      snapshotId: "fixture-1",
      asOf: "2026-08-08T12:00:00Z",
      baseCurrency: "GBP",
      fixture: true,
      warnings: ["demo fixture"],
      holdings: [
        {
          instrumentId: "a",
          ticker: "DEMO-A",
          name: "Demo A",
          securityType: "equity",
          quantity: "100",
          tradingCurrency: "GBP",
          referenceMarketValueBase: "45000"
        },
        {
          instrumentId: "b",
          ticker: "DEMO-B",
          name: "Demo B",
          securityType: "equity",
          quantity: "200",
          tradingCurrency: "GBP",
          referenceMarketValueBase: "35000"
        }
      ],
      cash: [{ currency: "GBP", amountBase: "20000" }]
    };

    const result = portfolioDiagnostics(snapshot);
    expect(result.totalReferenceValueBase).toBe("100000");
    expect(result.cashWeightPct).toBe("20.000000");
    expect(result.largestHoldingPct).toBe("45.000000");
    expect(result.top3HoldingPct).toBe("80.000000");
    expect(result.holdings).toEqual([
      { instrumentId: "a", ticker: "DEMO-A", weightPct: "45.000000" },
      { instrumentId: "b", ticker: "DEMO-B", weightPct: "35.000000" }
    ]);
  });
});
