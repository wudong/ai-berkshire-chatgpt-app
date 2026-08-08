import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { PortfolioSnapshot, ThesisVersion } from "./types.js";

const nonNegativeDecimalString = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/, "expected a non-negative decimal string");

const securityTypeSchema = z.enum(["equity", "etf", "cash", "other"]);
const thesisStatusSchema = z.enum([
  "green",
  "yellow",
  "red",
  "broken",
  "insufficient_evidence"
]);
const assumptionStatusSchema = z.enum([
  "supported",
  "weakening",
  "damaged",
  "falsified",
  "unknown"
]);

const holdingSchema = z.object({
  instrumentId: z.string().min(1),
  ticker: z.string().min(1),
  name: z.string().min(1),
  securityType: securityTypeSchema,
  quantity: nonNegativeDecimalString,
  tradingCurrency: z.string().min(1),
  referenceMarketValueBase: nonNegativeDecimalString,
  averageCost: nonNegativeDecimalString.optional(),
  costCurrency: z.string().min(1).optional()
});

const portfolioSnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  asOf: z.string().min(1),
  baseCurrency: z.string().min(1),
  holdings: z.array(holdingSchema),
  cash: z.array(
    z.object({
      currency: z.string().min(1),
      amountBase: nonNegativeDecimalString
    })
  ),
  fixture: z.boolean(),
  warnings: z.array(z.string())
});

const thesisSchema = z.object({
  thesisId: z.string().min(1),
  version: z.number().int().positive(),
  instrumentId: z.string().min(1),
  ticker: z.string().min(1),
  createdAt: z.string().min(1),
  fiveSentenceThesis: z.array(z.string().min(1)).length(5),
  assumptions: z.array(
    z.object({
      assumptionId: z.string().min(1),
      statement: z.string().min(1),
      validationMethod: z.string().min(1),
      cadence: z.string().min(1).optional(),
      status: assumptionStatusSchema,
      evidenceIds: z.array(z.string())
    })
  ),
  reviewTriggers: z.array(
    z.object({
      triggerId: z.string().min(1),
      statement: z.string().min(1),
      severity: z.enum(["review", "major_review"])
    })
  ),
  status: thesisStatusSchema
});

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");

async function readJson(relativePath: string): Promise<unknown> {
  const raw = await readFile(path.join(projectRoot, relativePath), "utf8");
  return JSON.parse(raw) as unknown;
}

export interface PortfolioRepository {
  getLatestSnapshot(): Promise<PortfolioSnapshot>;
}

export interface ThesisRepository {
  getLatestByTicker(ticker: string): Promise<ThesisVersion | null>;
}

export class FixtureResearchRepository
  implements PortfolioRepository, ThesisRepository
{
  async getLatestSnapshot(): Promise<PortfolioSnapshot> {
    return portfolioSnapshotSchema.parse(
      await readJson("fixtures/demo-portfolio.json")
    );
  }

  async getLatestByTicker(ticker: string): Promise<ThesisVersion | null> {
    const normalized = ticker.trim().toUpperCase();
    const theses = z
      .array(thesisSchema)
      .parse(await readJson("fixtures/demo-theses.json"));
    return (
      theses.find((thesis) => thesis.ticker.toUpperCase() === normalized) ?? null
    );
  }
}

export const researchRepository = new FixtureResearchRepository();
