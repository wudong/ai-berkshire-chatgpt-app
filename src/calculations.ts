import { Decimal } from "decimal.js";
import type {
  DecimalString,
  FinancialMetricValidationResult,
  FinancialValidationStatus,
  MarketCapVerificationResult,
  MetricValidationResult,
  PortfolioDiagnostics,
  PortfolioSnapshot,
  ValuationVerificationResult
} from "./types.js";

export const CALCULATION_VERSION = "0.2.0";

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

function positive(value: DecimalString, field: string): Decimal {
  const parsed = nonNegative(value, field);
  if (parsed.isZero()) throw new Error(`${field} must be greater than zero`);
  return parsed;
}

function exactString(value: Decimal): DecimalString {
  return value.toFixed();
}

function ratioString(value: Decimal): DecimalString {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
}

function percentString(value: Decimal): DecimalString {
  return ratioString(value);
}

function validationStatus(deviationPct: Decimal | null): FinancialValidationStatus {
  if (deviationPct === null) return "fail";
  if (deviationPct.lte(1)) return "pass";
  if (deviationPct.lte(5)) return "warning";
  return "fail";
}

function discrepancyPct(first: Decimal, second: Decimal): Decimal {
  const denominator = Decimal.max(first.abs(), second.abs());
  if (denominator.isZero()) return new Decimal(0);
  return first.minus(second).abs().div(denominator).mul(100);
}

/**
 * Legacy two-value helper kept for low-level exact-arithmetic tests.
 * The model-facing workflow should use validateFinancialMetric instead.
 */
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

/**
 * Mirror the original AI Berkshire market-cap check:
 * price × shares vs reported market cap, with <=1% pass, <=5% warning, >5% fail.
 */
export function verifyMarketCap(
  price: DecimalString,
  sharesOutstanding: DecimalString,
  reportedMarketCap: DecimalString,
  currency = "USD"
): MarketCapVerificationResult {
  const parsedPrice = nonNegative(price, "price");
  const shares = nonNegative(sharesOutstanding, "sharesOutstanding");
  const reported = nonNegative(reportedMarketCap, "reportedMarketCap");
  const calculated = parsedPrice.mul(shares);

  let deviation: Decimal | null;
  if (reported.isZero()) {
    deviation = calculated.isZero() ? new Decimal(0) : null;
  } else {
    deviation = calculated.minus(reported).abs().div(reported.abs()).mul(100);
  }

  return {
    price: exactString(parsedPrice),
    sharesOutstanding: exactString(shares),
    calculatedMarketCap: exactString(calculated),
    reportedMarketCap: exactString(reported),
    currency,
    discrepancyPct: deviation === null ? null : percentString(deviation),
    status: validationStatus(deviation),
    calculationVersion: CALCULATION_VERSION
  };
}

function median(values: Decimal[]): Decimal {
  if (values.length === 0) throw new Error("at least two source values are required");
  const sorted = [...values].sort((a, b) => a.cmp(b));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return sorted[middle - 1]!.plus(sorted[middle]!).div(2);
}

/**
 * Mirror the original cross-source workflow: use the median as the reference,
 * but apply the stricter policy documented in skills/financial-data.md.
 */
export function validateFinancialMetric(
  field: string,
  sourceValues: Record<string, DecimalString>,
  unit = ""
): FinancialMetricValidationResult {
  const entries = Object.entries(sourceValues);
  if (entries.length < 2) {
    throw new Error("validateFinancialMetric requires at least two independent sources");
  }

  const parsed = entries.map(([source, value]) => ({
    source,
    value: decimal(value, `${field}.${source}`)
  }));
  const reference = median(parsed.map((entry) => entry.value));

  const sourceResults = parsed.map(({ source, value }) => {
    let deviation: Decimal | null;
    if (reference.isZero()) {
      deviation = value.isZero() ? new Decimal(0) : null;
    } else {
      deviation = value.minus(reference).abs().div(reference.abs()).mul(100);
    }

    return {
      source,
      value: exactString(value),
      deviationPct: deviation === null ? null : percentString(deviation),
      status: validationStatus(deviation)
    };
  });

  const numericDeviations = sourceResults
    .map((result) => result.deviationPct)
    .filter((value): value is string => value !== null)
    .map((value) => new Decimal(value));

  const hasUndefinedDeviation = sourceResults.some(
    (result) => result.deviationPct === null
  );
  const maxDeviation =
    numericDeviations.length > 0 ? Decimal.max(...numericDeviations) : null;

  let status: FinancialValidationStatus;
  if (hasUndefinedDeviation || sourceResults.some((result) => result.status === "fail")) {
    status = "fail";
  } else if (sourceResults.some((result) => result.status === "warning")) {
    status = "warning";
  } else {
    status = "pass";
  }

  return {
    field,
    unit,
    sourceCount: entries.length,
    referenceMedian: exactString(reference),
    sources: sourceResults,
    maxDeviationPct: maxDeviation === null ? null : percentString(maxDeviation),
    status,
    policy: "<=1% pass; >1% to <=5% warning; >5% fail",
    calculationVersion: CALCULATION_VERSION
  };
}

export function earningsYieldPct(
  earningsPerShare: DecimalString,
  price: DecimalString
): DecimalString {
  const eps = decimal(earningsPerShare, "earningsPerShare");
  const parsedPrice = positive(price, "price");
  return percentString(eps.div(parsedPrice).mul(100));
}

export function freeCashFlowYieldPct(
  freeCashFlow: DecimalString,
  marketCap: DecimalString
): DecimalString {
  const fcf = decimal(freeCashFlow, "freeCashFlow");
  const parsedMarketCap = positive(marketCap, "marketCap");
  return percentString(fcf.div(parsedMarketCap).mul(100));
}

/**
 * Mirror financial_rigor.py verify-valuation without inventing missing inputs.
 */
export function verifyValuation(input: {
  price: DecimalString;
  eps?: DecimalString;
  bookValuePerShare?: DecimalString;
  fcfPerShare?: DecimalString;
  dividendPerShare?: DecimalString;
}): ValuationVerificationResult {
  const price = positive(input.price, "price");
  const result: ValuationVerificationResult = {
    price: exactString(price),
    calculationVersion: CALCULATION_VERSION
  };

  if (input.eps !== undefined) {
    const eps = decimal(input.eps, "eps");
    if (!eps.isZero()) {
      result.pe = ratioString(price.div(eps));
      result.earningsYieldPct = percentString(eps.div(price).mul(100));
    }
  }

  if (input.bookValuePerShare !== undefined) {
    const bvps = decimal(input.bookValuePerShare, "bookValuePerShare");
    if (!bvps.isZero()) {
      result.pb = ratioString(price.div(bvps));
      if (input.eps !== undefined) {
        const eps = decimal(input.eps, "eps");
        if (!eps.isZero()) {
          result.roePct = percentString(eps.div(bvps).mul(100));
        }
      }
    }
  }

  if (input.fcfPerShare !== undefined) {
    const fcf = decimal(input.fcfPerShare, "fcfPerShare");
    if (!fcf.isZero()) {
      result.pFcf = ratioString(price.div(fcf));
      result.fcfYieldPct = percentString(fcf.div(price).mul(100));
    }
  }

  if (input.dividendPerShare !== undefined) {
    const dividend = nonNegative(input.dividendPerShare, "dividendPerShare");
    result.dividendYieldPct = percentString(dividend.div(price).mul(100));
  }

  return result;
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
