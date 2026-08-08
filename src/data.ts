import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import type { InvestmentThesis, Portfolio } from "./types.js";

const thesisStatusSchema = z.enum(["GREEN", "YELLOW", "RED", "BROKEN"]);

const holdingSchema = z.object({
  ticker: z.string().min(1),
  company: z.string().min(1),
  market: z.string().min(1),
  currency: z.string().min(1),
  shares: z.number().nonnegative(),
  averageCost: z.number().nonnegative(),
  referencePrice: z.number().nonnegative(),
  weightPct: z.number().min(0).max(100),
  thesisStatus: thesisStatusSchema,
  conviction: z.number().min(1).max(10),
  ownerEarningsYieldPct: z.number().optional(),
  expectedGrowthPct: z.number().optional()
});

const portfolioSchema = z.object({
  asOf: z.string().min(1),
  baseCurrency: z.string().min(1),
  cashPct: z.number().min(0).max(100),
  holdings: z.array(holdingSchema),
  notes: z.array(z.string()).optional()
});

const assumptionSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  status: z.enum(["INTACT", "WEAKENING", "BROKEN", "UNKNOWN"]),
  evidence: z.string().optional()
});

const thesisSchema = z.object({
  ticker: z.string().min(1),
  company: z.string().min(1),
  status: thesisStatusSchema,
  lastReviewed: z.string().min(1),
  businessEssence: z.string(),
  moat: z.string(),
  management: z.string(),
  valuation: z.string(),
  downsideControl: z.string(),
  assumptions: z.array(assumptionSchema),
  redLines: z.array(z.string()),
  whatWouldChangeOurMind: z.array(z.string())
});

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");

async function readJson(relativePath: string): Promise<unknown> {
  const raw = await readFile(path.join(projectRoot, relativePath), "utf8");
  return JSON.parse(raw) as unknown;
}

export async function loadPortfolio(): Promise<Portfolio> {
  return portfolioSchema.parse(await readJson("data/portfolio.json"));
}

export async function loadTheses(): Promise<InvestmentThesis[]> {
  return z.array(thesisSchema).parse(await readJson("data/theses.json"));
}

export async function loadThesis(ticker: string): Promise<InvestmentThesis | null> {
  const normalized = ticker.trim().toUpperCase();
  const theses = await loadTheses();
  return theses.find((thesis) => thesis.ticker.toUpperCase() === normalized) ?? null;
}
