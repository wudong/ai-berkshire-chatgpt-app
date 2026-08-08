import { Decimal } from "decimal.js";
import type {
  DecimalString,
  MarketCapVerificationResult,
  MetricValidationResult,
  PortfolioDiagnostics,
  PortfolioSnapshot
} from "./types.js";

export const CALCULATION_VERSION = "0.1.0";

function decimal(value: DecimalString, field: string): Decimal {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) throw new Error("not finite");
    return parsed;
  } catch {
    throw new Error(`${field} must be a finite decimal string; received ${value}`);
  }
}

function nonNegative(value: DecimalString, field: string): Decimal {
  const parsed = decimal(value, field);
  if (parsed.isNegative()) {
    throw new Error(`${field} must be non-negative; received ${value}`);
  }
  return parsed;
}

function exactString(value: Decimal): DecimalString {
  return value.toFixed();
}

function percentString(value: Decimal): DecimalString {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function discrepancyPct(first: Decimal, second: Decimal): Decimal {
  const denominator = Decimal.max(first.abs(), second.abs());
  if (denominator.isZero()) return new Decimal(0);
  return first.minus(second).abs().div(denominator).mul(100);
}

export function crossValidateMetric(
  firstValue: DecimalString,
  secondValue: DecimalString,
  tolerancePct: DecimalString = "1"
): MetricValidationResult {
  const first = decimal(firstValue, "firstValue");
  const second = decimal(secondValue, "secondValue");
  const tolerance = nonNegative(tolerancePct, "tolerancePct");
  const discrepancy = discrepancyPct(first, second);

  return {
    firstValue: exactString(first),
    secondValue: exactString(second),
    discrepancyPct: percentString(discrepancy),
    tolerancePct: exactString(tolerance),
    status: discrepancy.lte(tolerance) ? "consistent" : "conflicting",
    calculationVersion: CALCULATION_VERSION
  };
}

export function verifyMarketCap(
  price: DecimalString,
  sharesOutstanding: DecimalString,
  reportedMarketCap: DecimalString,
  tolerancePct: DecimalString = "1"
): MarketCapVerificationResult {
  const parsedPrice = nonNegative(price, "price");
  const shares = nonNegative(sharesOutstanding, "sharesOutstanding");
  const reported = nonNegative(reportedMarketCap, "reportedMarketCap");
  const calculated = parsedPrice.mul(shares);
  const validation = crossValidateMetric(
    exactString(calculated),
    exactString(reported),
    tolerancePct
  );

  return {
    calculatedMarketCap: exactString(calculated),
    reportedMarketCap: exactString(reported),
    discrepancyPct: validation.discrepancyPct,
    tolerancePct: validation.tolerancePct,
    status: validation.status,
    calculationVersion: CALCULATION_VERSION
  };
}

export function earningsYieldPct(
  earningsPerShare: DecimalString,
  price: DecimalString
): DecimalString {
  const eps = decimal(earningsPerShare, "earningsPerShare");
  const parsedPrice = nonNegative(price, "price");
  if (parsedPrice.isZero()) throw new Error("price must be greater than zero");
  return percentString(eps.div(parsedPrice).mul(100));
}

export function freeCashFlowYieldPct(
  freeCashFlow: DecimalString,
  marketCap: DecimalString
): DecimalString {
  const fcf = decimal(freeCashFlow, "freeCashFlow");
  const parsedMarketCap = nonNegative(marketCap, "marketCap");
  if (parsedMarketCap.isZero()) {
    throw new Error("marketCap must be greater than zero");
  }
  return percentString(fcf.div(parsedMarketCap).mul(100));
}

export function portfolioDiagnostics(
  snapshot: PortfolioSnapshot
): PortfolioDiagnostics {
  const holdingValues = snapshot.holdings.map((holding) => ({
    instrumentId: holding.instrumentId,
    ticker: holding.ticker,
    value: nonNegative(
      holding.referenceMarketValueBase,
      `${holding.ticker}.referenceMarketValueBase`
    )
  }));

  const invested = holdingValues.reduce(
    (sum, holding) => sum.plus(holding.value),
    new Decimal(0)
  );
  const cash = snapshot.cash.reduce(
    (sum, balance) =>
      sum.plus(nonNegative(balance.amountBase, `${balance.currency}.amountBase`)),
    new Decimal(0)
  );
  const total = invested.plus(cash);

  if (total.isZero()) {
    throw new Error("portfolio reference value must be greater than zero");
  }

  const weights = holdingValues.map((holding) => ({
    instrumentId: holding.instrumentId,
    ticker: holding.ticker,
    weight: holding.value.div(total).mul(100)
  }));

  const sortedWeights = [...weights].sort((a, b) => b.weight.cmp(a.weight));
  const largest = sortedWeights[0]?.weight ?? new Decimal(0);
  const top3 = sortedWeights
    .slice(0, 3)
    .reduce((sum, holding) => sum.plus(holding.weight), new Decimal(0));

  return {
    snapshotId: snapshot.snapshotId,
    asOf: snapshot.asOf,
    baseCurrency: snapshot.baseCurrency,
    totalReferenceValueBase: exactString(total),
    investedReferenceValueBase: exactString(invested),
    cashReferenceValueBase: exactString(cash),
    cashWeightPct: percentString(cash.div(total).mul(100)),
    holdings: weights.map((holding) => ({
      instrumentId: holding.instrumentId,
      ticker: holding.ticker,
      weightPct: percentString(holding.weight)
    })),
    largestHoldingPct: percentString(largest),
    top3HoldingPct: percentString(top3),
    holdingCount: snapshot.holdings.length,
    warnings: [...snapshot.warnings],
    calculationVersion: CALCULATION_VERSION
  };
}
