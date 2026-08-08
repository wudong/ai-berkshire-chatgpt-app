export type ThesisStatus = "GREEN" | "YELLOW" | "RED" | "BROKEN";

export interface Holding {
  ticker: string;
  company: string;
  market: string;
  currency: string;
  shares: number;
  averageCost: number;
  referencePrice: number;
  weightPct: number;
  thesisStatus: ThesisStatus;
  conviction: number;
  ownerEarningsYieldPct?: number;
  expectedGrowthPct?: number;
}

export interface Portfolio {
  asOf: string;
  baseCurrency: string;
  cashPct: number;
  holdings: Holding[];
  notes?: string[];
}

export interface ThesisAssumption {
  id: string;
  statement: string;
  status: "INTACT" | "WEAKENING" | "BROKEN" | "UNKNOWN";
  evidence?: string;
}

export interface InvestmentThesis {
  ticker: string;
  company: string;
  status: ThesisStatus;
  lastReviewed: string;
  businessEssence: string;
  moat: string;
  management: string;
  valuation: string;
  downsideControl: string;
  assumptions: ThesisAssumption[];
  redLines: string[];
  whatWouldChangeOurMind: string[];
}

export interface PortfolioAlert {
  severity: "INFO" | "WATCH" | "HIGH";
  ticker?: string;
  message: string;
}

export interface PortfolioReview {
  asOf: string;
  defaultAction: "NO_ACTION";
  concentration: {
    largestHoldingPct: number;
    top3Pct: number;
    holdingCount: number;
    cashPct: number;
  };
  thesisSummary: Record<ThesisStatus, number>;
  opportunityRanking: Array<{
    ticker: string;
    estimatedAnnualReturnPct: number | null;
    conviction: number;
    thesisStatus: ThesisStatus;
  }>;
  alerts: PortfolioAlert[];
  methodologyNote: string;
}

export interface CandidateOpportunity {
  ticker: string;
  company: string;
  ownerEarningsYieldPct: number;
  expectedGrowthPct: number;
  conviction: number;
  thesisStatus: ThesisStatus;
  cashHurdlePct: number;
}

export interface OpportunityComparison {
  candidate: {
    ticker: string;
    estimatedAnnualReturnPct: number;
    conviction: number;
    thesisStatus: ThesisStatus;
  };
  bestExisting: {
    ticker: string;
    estimatedAnnualReturnPct: number;
    conviction: number;
  } | null;
  weakestExisting: {
    ticker: string;
    estimatedAnnualReturnPct: number;
    conviction: number;
  } | null;
  cashHurdlePct: number;
  researchVerdict: "RESEARCH_FURTHER" | "WATCH" | "PASS";
  rationale: string[];
  methodologyNote: string;
}
