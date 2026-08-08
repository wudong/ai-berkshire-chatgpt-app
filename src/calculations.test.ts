import { describe, expect, it } from "vitest";
import {
  crossValidateMetric,
  earningsYieldPct,
  portfolioDiagnostics,
  verifyMarketCap
} from "./calculations.js";
import type { PortfolioSnapshot } from "./types.js";

describe("exact financial calculations", () => {
  it("keeps a discrepancy exactly at the tolerance consistent", () => {
    const result = crossValidateMetric("99", "100", "1");
    expect(result.discrepancyPct).toBe("1.000000");
    expect(result.status).toBe("consistent");
  });

  it("flags a discrepancy above the tolerance", () => {
    const result = crossValidateMetric("98.9", "100", "1");
    expect(result.discrepancyPct).toBe("1.100000");
    expect(result.status).toBe("conflicting");
  });

  it("multiplies very large market-cap inputs without binary-float loss", () => {
    const result = verifyMarketCap(
      "123.456789",
      "9876543210",
      "1219326311126.352690",
      "0"
    );
    expect(result.calculatedMarketCap).toBe("1219326311126.35269");
    expect(result.status).toBe("consistent");
  });

  it("calculates earnings yield as a decimal-string percentage", () => {
    expect(earningsYieldPct("5", "125")).toBe("4.000000");
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
