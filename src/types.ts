export type SecurityType = "equity" | "etf" | "cash" | "other";

export type ThesisStatus =
  | "green"
  | "yellow"
  | "red"
  | "broken"
  | "insufficient_evidence";

export type AssumptionStatus =
  | "supported"
  | "weakening"
  | "damaged"
  | "falsified"
  | "unknown";

/** Financial quantities are serialized as decimal strings. */
export type DecimalString = string;

export interface InstrumentHolding {
  instrumentId: string;
  ticker: string;
  name: string;
  securityType: SecurityType;
  quantity: DecimalString;
  tradingCurrency: string;
  referenceMarketValueBase: DecimalString;
  averageCost?: DecimalString;
  costCurrency?: string;
}

export interface CashBalance {
  currency: string;
  amountBase: DecimalString;
}

export interface PortfolioSnapshot {
  snapshotId: string;
  asOf: string;
  baseCurrency: string;
  holdings: InstrumentHolding[];
  cash: CashBalance[];
  fixture: boolean;
  warnings: string[];
}

export interface ThesisAssumption {
  assumptionId: string;
  statement: string;
  validationMethod: string;
  cadence?: string;
  status: AssumptionStatus;
  evidenceIds: string[];
}

export interface ReviewTrigger {
  triggerId: string;
  statement: string;
  severity: "review" | "major_review";
}

export interface ThesisVersion {
  thesisId: string;
  version: number;
  instrumentId: string;
  ticker: string;
  createdAt: string;
  fiveSentenceThesis: string[];
  assumptions: ThesisAssumption[];
  reviewTriggers: ReviewTrigger[];
  status: ThesisStatus;
}

export interface HoldingWeight {
  instrumentId: string;
  ticker: string;
  weightPct: DecimalString;
}

export interface PortfolioDiagnostics {
  snapshotId: string;
  asOf: string;
  baseCurrency: string;
  totalReferenceValueBase: DecimalString;
  investedReferenceValueBase: DecimalString;
  cashReferenceValueBase: DecimalString;
  cashWeightPct: DecimalString;
  holdings: HoldingWeight[];
  largestHoldingPct: DecimalString;
  top3HoldingPct: DecimalString;
  holdingCount: number;
  warnings: string[];
  calculationVersion: string;
}

export interface MetricValidationResult {
  firstValue: DecimalString;
  secondValue: DecimalString;
  discrepancyPct: DecimalString;
  tolerancePct: DecimalString;
  status: "consistent" | "conflicting";
  calculationVersion: string;
}

export interface MarketCapVerificationResult {
  calculatedMarketCap: DecimalString;
  reportedMarketCap: DecimalString;
  discrepancyPct: DecimalString;
  tolerancePct: DecimalString;
  status: "consistent" | "conflicting";
  calculationVersion: string;
}
