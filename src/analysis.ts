import type {
  CandidateOpportunity,
  Holding,
  OpportunityComparison,
  Portfolio,
  PortfolioReview,
  ThesisStatus
} from "./types.js";

function estimatedAnnualReturnPct(holding: Holding): number | null {
  if (
    holding.ownerEarningsYieldPct === undefined ||
    holding.expectedGrowthPct === undefined
  ) {
    return null;
  }

  return Number(
    (holding.ownerEarningsYieldPct + holding.expectedGrowthPct).toFixed(2)
  );
}

export function reviewPortfolio(portfolio: Portfolio): PortfolioReview {
  const holdingsByWeight = [...portfolio.holdings].sort(
    (a, b) => b.weightPct - a.weightPct
  );

  const largestHoldingPct = holdingsByWeight[0]?.weightPct ?? 0;
  const top3Pct = Number(
    holdingsByWeight
      .slice(0, 3)
      .reduce((sum, holding) => sum + holding.weightPct, 0)
      .toFixed(2)
  );

  const thesisSummary: Record<ThesisStatus, number> = {
    GREEN: 0,
    YELLOW: 0,
    RED: 0,
    BROKEN: 0
  };

  for (const holding of portfolio.holdings) {
    thesisSummary[holding.thesisStatus] += 1;
  }

  const alerts: PortfolioReview["alerts"] = [];
  const investedPct = portfolio.holdings.reduce(
    (sum, holding) => sum + holding.weightPct,
    0
  );
  const accountedPct = Number((investedPct + portfolio.cashPct).toFixed(2));

  if (Math.abs(accountedPct - 100) > 0.5) {
    alerts.push({
      severity: "INFO",
      message: `Portfolio weights plus cash total ${accountedPct}%, not 100%. Review the input snapshot.`
    });
  }

  if (largestHoldingPct > 40) {
    alerts.push({
      severity: "WATCH",
      ticker: holdingsByWeight[0]?.ticker,
      message:
        "The largest holding exceeds 40%. This is not automatically wrong, but concentration should be justified by unusually high certainty and downside resilience."
    });
  }

  for (const holding of portfolio.holdings) {
    if (holding.thesisStatus === "BROKEN" || holding.thesisStatus === "RED") {
      alerts.push({
        severity: "HIGH",
        ticker: holding.ticker,
        message: `${holding.ticker} has thesis status ${holding.thesisStatus}. Re-check the original assumptions and red lines before considering any new capital allocation.`
      });
    } else if (holding.thesisStatus === "YELLOW") {
      alerts.push({
        severity: "WATCH",
        ticker: holding.ticker,
        message: `${holding.ticker} has a weakening thesis. Identify which assumptions changed and whether the evidence is temporary, cyclical, or structural.`
      });
    }
  }

  const opportunityRanking = portfolio.holdings
    .map((holding) => ({
      ticker: holding.ticker,
      estimatedAnnualReturnPct: estimatedAnnualReturnPct(holding),
      conviction: holding.conviction,
      thesisStatus: holding.thesisStatus
    }))
    .sort((a, b) => {
      const aReturn = a.estimatedAnnualReturnPct ?? Number.NEGATIVE_INFINITY;
      const bReturn = b.estimatedAnnualReturnPct ?? Number.NEGATIVE_INFINITY;
      if (aReturn !== bReturn) return bReturn - aReturn;
      return b.conviction - a.conviction;
    });

  return {
    asOf: portfolio.asOf,
    defaultAction: "NO_ACTION",
    concentration: {
      largestHoldingPct,
      top3Pct,
      holdingCount: portfolio.holdings.length,
      cashPct: portfolio.cashPct
    },
    thesisSummary,
    opportunityRanking,
    alerts,
    methodologyNote:
      "Decision support only. The simplified return estimate is owner-earnings yield plus expected growth; it is not a forecast or intrinsic-value model. Price movement alone is not a thesis change."
  };
}

export function compareOpportunity(
  portfolio: Portfolio,
  candidate: CandidateOpportunity
): OpportunityComparison {
  const candidateReturn = Number(
    (candidate.ownerEarningsYieldPct + candidate.expectedGrowthPct).toFixed(2)
  );

  const existing = portfolio.holdings
    .map((holding) => ({
      ticker: holding.ticker,
      estimatedAnnualReturnPct: estimatedAnnualReturnPct(holding),
      conviction: holding.conviction
    }))
    .filter(
      (
        item
      ): item is {
        ticker: string;
        estimatedAnnualReturnPct: number;
        conviction: number;
      } => item.estimatedAnnualReturnPct !== null
    );

  const bestExisting =
    [...existing].sort(
      (a, b) =>
        b.estimatedAnnualReturnPct - a.estimatedAnnualReturnPct ||
        b.conviction - a.conviction
    )[0] ?? null;

  const weakestExisting =
    [...existing].sort(
      (a, b) =>
        a.estimatedAnnualReturnPct - b.estimatedAnnualReturnPct ||
        a.conviction - b.conviction
    )[0] ?? null;

  const rationale: string[] = [];
  let researchVerdict: OpportunityComparison["researchVerdict"] = "WATCH";

  if (candidate.thesisStatus === "RED" || candidate.thesisStatus === "BROKEN") {
    researchVerdict = "PASS";
    rationale.push(
      "The supplied thesis state is already impaired; cheapness should not override a broken business-quality or integrity case."
    );
  } else if (candidateReturn <= candidate.cashHurdlePct) {
    researchVerdict = "PASS";
    rationale.push(
      `The simplified expected return (${candidateReturn}%) does not clear the supplied cash hurdle (${candidate.cashHurdlePct}%).`
    );
  } else if (candidate.conviction < 7 || candidate.thesisStatus === "YELLOW") {
    researchVerdict = "WATCH";
    rationale.push(
      "The return estimate may be interesting, but certainty is not high enough to justify treating it as a superior capital-allocation candidate."
    );
  } else if (
    bestExisting &&
    candidateReturn <= bestExisting.estimatedAnnualReturnPct
  ) {
    researchVerdict = "WATCH";
    rationale.push(
      `An existing holding (${bestExisting.ticker}) has an equal or higher simplified return estimate, so the new idea has not yet demonstrated superior opportunity cost.`
    );
  } else {
    researchVerdict = "RESEARCH_FURTHER";
    rationale.push(
      "The candidate clears the supplied cash hurdle and compares favorably with the current portfolio on the supplied assumptions. A full business, moat, management, downside, and valuation review is still required."
    );
  }

  if (weakestExisting) {
    rationale.push(
      `The weakest modeled existing opportunity is ${weakestExisting.ticker} at ${weakestExisting.estimatedAnnualReturnPct}% with conviction ${weakestExisting.conviction}/10; use it as an explicit opportunity-cost comparison.`
    );
  }

  return {
    candidate: {
      ticker: candidate.ticker.toUpperCase(),
      estimatedAnnualReturnPct: candidateReturn,
      conviction: candidate.conviction,
      thesisStatus: candidate.thesisStatus
    },
    bestExisting,
    weakestExisting,
    cashHurdlePct: candidate.cashHurdlePct,
    researchVerdict,
    rationale,
    methodologyNote:
      "This comparison uses only user-supplied assumptions and the local portfolio snapshot. It does not fetch live prices, filings, rates, or analyst forecasts."
  };
}
