import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  portfolioDiagnostics,
  validateFinancialMetric,
  verifyMarketCap,
  verifyValuation
} from "./calculations.js";
import { researchRepository } from "./data.js";

const APP_NAME = "ai-berkshire-portfolio";
const APP_VERSION = "0.2.0";
const MCP_PATH = "/mcp";
const PORTFOLIO_WIDGET_URI = "ui://ai-berkshire/portfolio/v1.html";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");

const decimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
const financialDecimalStringSchema = z
  .string()
  .regex(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/);
const validationStatusSchema = z.enum(["pass", "warning", "fail"]);
const thesisStatusSchema = z.enum([
  "green",
  "yellow",
  "red",
  "broken",
  "insufficient_evidence"
]);

const holdingSchema = z.object({
  instrumentId: z.string(),
  ticker: z.string(),
  name: z.string(),
  securityType: z.enum(["equity", "etf", "cash", "other"]),
  quantity: decimalStringSchema,
  tradingCurrency: z.string(),
  referenceMarketValueBase: decimalStringSchema,
  averageCost: decimalStringSchema.optional(),
  costCurrency: z.string().optional()
});

const snapshotSchema = z.object({
  snapshotId: z.string(),
  asOf: z.string(),
  baseCurrency: z.string(),
  holdings: z.array(holdingSchema),
  cash: z.array(
    z.object({ currency: z.string(), amountBase: decimalStringSchema })
  ),
  fixture: z.boolean(),
  warnings: z.array(z.string())
});

const thesisSchema = z.object({
  thesisId: z.string(),
  version: z.number().int().positive(),
  instrumentId: z.string(),
  ticker: z.string(),
  createdAt: z.string(),
  fiveSentenceThesis: z.array(z.string()).length(5),
  assumptions: z.array(
    z.object({
      assumptionId: z.string(),
      statement: z.string(),
      validationMethod: z.string(),
      cadence: z.string().optional(),
      status: z.enum([
        "supported",
        "weakening",
        "damaged",
        "falsified",
        "unknown"
      ]),
      evidenceIds: z.array(z.string())
    })
  ),
  reviewTriggers: z.array(
    z.object({
      triggerId: z.string(),
      statement: z.string(),
      severity: z.enum(["review", "major_review"])
    })
  ),
  status: thesisStatusSchema
});

const diagnosticsSchema = z.object({
  snapshotId: z.string(),
  asOf: z.string(),
  baseCurrency: z.string(),
  totalReferenceValueBase: decimalStringSchema,
  investedReferenceValueBase: decimalStringSchema,
  cashReferenceValueBase: decimalStringSchema,
  cashWeightPct: decimalStringSchema,
  holdings: z.array(
    z.object({
      instrumentId: z.string(),
      ticker: z.string(),
      weightPct: decimalStringSchema
    })
  ),
  largestHoldingPct: decimalStringSchema,
  top3HoldingPct: decimalStringSchema,
  holdingCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
  calculationVersion: z.string()
});

const marketCapVerificationSchema = z.object({
  price: financialDecimalStringSchema,
  sharesOutstanding: financialDecimalStringSchema,
  calculatedMarketCap: financialDecimalStringSchema,
  reportedMarketCap: financialDecimalStringSchema,
  currency: z.string(),
  discrepancyPct: financialDecimalStringSchema.nullable(),
  status: validationStatusSchema,
  calculationVersion: z.string()
});

const financialMetricValidationSchema = z.object({
  field: z.string(),
  unit: z.string(),
  sourceCount: z.number().int().min(2),
  referenceMedian: financialDecimalStringSchema,
  sources: z.array(
    z.object({
      source: z.string(),
      value: financialDecimalStringSchema,
      deviationPct: financialDecimalStringSchema.nullable(),
      status: validationStatusSchema
    })
  ),
  maxDeviationPct: financialDecimalStringSchema.nullable(),
  status: validationStatusSchema,
  policy: z.literal("<=1% pass; >1% to <=5% warning; >5% fail"),
  calculationVersion: z.string()
});

const valuationVerificationSchema = z.object({
  price: financialDecimalStringSchema,
  pe: financialDecimalStringSchema.optional(),
  earningsYieldPct: financialDecimalStringSchema.optional(),
  pb: financialDecimalStringSchema.optional(),
  roePct: financialDecimalStringSchema.optional(),
  pFcf: financialDecimalStringSchema.optional(),
  fcfYieldPct: financialDecimalStringSchema.optional(),
  dividendYieldPct: financialDecimalStringSchema.optional(),
  calculationVersion: z.string()
});

function widgetHtml(): string {
  try {
    const bundle = readFileSync(
      path.join(projectRoot, "web/dist/widget.js"),
      "utf8"
    );
    return `<div id="root"></div><script type="module">${bundle}</script>`;
  } catch {
    return `<!doctype html><html><body style="font-family:system-ui;padding:16px"><strong>Portfolio widget is not built.</strong><p>Run <code>npm run build:widget</code>, then restart the MCP server.</p></body></html>`;
  }
}

function readOnlyAnnotations() {
  return {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false
  } as const;
}

function createBerkshireServer(): McpServer {
  const server = new McpServer(
    { name: APP_NAME, version: APP_VERSION },
    {
      instructions:
        "Follow the original AI Berkshire workflow for US-listed operating companies. ChatGPT is the web-research layer: gather financial facts from Macrotrends and StockAnalysis, and use SEC filings/company investor relations as authoritative primary sources for critical figures or disagreements. Then call this app's deterministic financial-rigor tools before investment interpretation. Separate FACT, ANALYSIS, and UNCERTAINTY. Do not infer live values from portfolio fixtures, do not treat price movement alone as thesis change, and do not execute trades."
    }
  );

  registerAppResource(
    server,
    "portfolio-dashboard",
    PORTFOLIO_WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: PORTFOLIO_WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml(),
          _meta: { ui: { prefersBorder: true } }
        }
      ]
    })
  );

  server.registerTool(
    "get_portfolio_snapshot",
    {
      title: "Get portfolio snapshot",
      description:
        "Load the current portfolio snapshot for research. Returns quantities, reference values, cash, timestamp, and data warnings only. No recommendation or interpretation. v0 uses a fictional fixture.",
      inputSchema: {},
      outputSchema: { snapshot: snapshotSchema },
      annotations: readOnlyAnnotations()
    },
    async () => {
      const snapshot = await researchRepository.getLatestSnapshot();
      return {
        structuredContent: { snapshot },
        content: [
          {
            type: "text",
            text: `Loaded ${snapshot.fixture ? "fictional fixture" : "portfolio"} snapshot ${snapshot.snapshotId} as of ${snapshot.asOf}. Values are reference inputs, not live quotes.`
          }
        ]
      };
    }
  );

  server.registerTool(
    "get_thesis",
    {
      title: "Get investment thesis",
      description:
        "Load the latest explicit thesis version for an existing holding, including five-sentence thesis, falsifiable assumptions, assumption status, and review triggers. A review trigger starts research; it is not a trade instruction.",
      inputSchema: {
        ticker: z.string().min(1).describe("Ticker in the thesis repository")
      },
      outputSchema: { thesis: thesisSchema.nullable() },
      annotations: readOnlyAnnotations()
    },
    async ({ ticker }) => {
      const thesis = await researchRepository.getLatestByTicker(ticker);
      return {
        structuredContent: { thesis },
        content: [
          {
            type: "text",
            text: thesis
              ? `${thesis.ticker} thesis v${thesis.version} has status ${thesis.status}. Interpret it with its evidence gaps and review triggers.`
              : `No thesis exists for ${ticker.toUpperCase()}. Do not invent missing portfolio state.`
          }
        ]
      };
    }
  );

  server.registerTool(
    "verify_market_cap",
    {
      title: "Verify market cap",
      description:
        "Use after collecting a US stock's current price, latest shares outstanding, and a reported market cap. Mirrors AI Berkshire financial_rigor.py: calculate price × shares exactly and classify discrepancy as pass (<=1%), warning (>1% to <=5%), or fail (>5%).",
      inputSchema: {
        price: financialDecimalStringSchema.describe("Current/share price as a decimal string"),
        sharesOutstanding: financialDecimalStringSchema.describe("Latest shares outstanding as a decimal string"),
        reportedMarketCap: financialDecimalStringSchema.describe("Market cap reported by the researched source"),
        currency: z.string().default("USD")
      },
      outputSchema: { verification: marketCapVerificationSchema },
      annotations: readOnlyAnnotations()
    },
    async ({ price, sharesOutstanding, reportedMarketCap, currency }) => {
      const verification = verifyMarketCap(
        price,
        sharesOutstanding,
        reportedMarketCap,
        currency
      );
      return {
        structuredContent: { verification },
        content: [
          {
            type: "text",
            text: `Market-cap verification: ${verification.status}; calculated ${verification.calculatedMarketCap} ${verification.currency} vs reported ${verification.reportedMarketCap} ${verification.currency}, discrepancy ${verification.discrepancyPct ?? "undefined"}%.`
          }
        ]
      };
    }
  );

  server.registerTool(
    "validate_financial_metric",
    {
      title: "Validate financial metric",
      description:
        "Cross-check a US-company financial metric collected from at least two independent sources such as Macrotrends, StockAnalysis, and SEC/company filings. Uses the exact median as the reference and AI Berkshire's documented 1%/5% discrepancy bands.",
      inputSchema: {
        field: z.string().min(1),
        sourceValues: z.record(financialDecimalStringSchema).refine(
          (values) => Object.keys(values).length >= 2,
          "At least two independent source values are required"
        ),
        unit: z.string().default("")
      },
      outputSchema: { validation: financialMetricValidationSchema },
      annotations: readOnlyAnnotations()
    },
    async ({ field, sourceValues, unit }) => {
      const validation = validateFinancialMetric(field, sourceValues, unit);
      return {
        structuredContent: { validation },
        content: [
          {
            type: "text",
            text: `${field} cross-validation: ${validation.status} across ${validation.sourceCount} source(s); median ${validation.referenceMedian}${unit ? ` ${unit}` : ""}. If status is fail, check the SEC/company filing before continuing.`
          }
        ]
      };
    }
  );

  server.registerTool(
    "verify_valuation",
    {
      title: "Verify valuation ratios",
      description:
        "Calculate valuation ratios from raw US-stock inputs using exact decimal arithmetic. Mirrors the original AI Berkshire verify-valuation helper. Missing inputs stay missing; the tool never invents them.",
      inputSchema: {
        price: financialDecimalStringSchema,
        eps: financialDecimalStringSchema.optional(),
        bookValuePerShare: financialDecimalStringSchema.optional(),
        fcfPerShare: financialDecimalStringSchema.optional(),
        dividendPerShare: financialDecimalStringSchema.optional()
      },
      outputSchema: { valuation: valuationVerificationSchema },
      annotations: readOnlyAnnotations()
    },
    async (input) => {
      const valuation = verifyValuation(input);
      return {
        structuredContent: { valuation },
        content: [
          {
            type: "text",
            text: `Valuation ratios calculated with exact decimal arithmetic. Returned fields: ${Object.keys(valuation).filter((key) => !["price", "calculationVersion"].includes(key)).join(", ") || "none"}.`
          }
        ]
      };
    }
  );

  server.registerTool(
    "run_portfolio_diagnostics",
    {
      title: "Run portfolio diagnostics",
      description:
        "Calculate deterministic portfolio weights, cash weight, largest-position weight, top-three weight, and data warnings using exact decimal arithmetic. Returns structure only; it does not define a universally correct concentration level or produce buy/sell advice.",
      inputSchema: {},
      outputSchema: { diagnostics: diagnosticsSchema },
      annotations: readOnlyAnnotations()
    },
    async () => {
      const snapshot = await researchRepository.getLatestSnapshot();
      const diagnostics = portfolioDiagnostics(snapshot);
      return {
        structuredContent: { diagnostics },
        content: [
          {
            type: "text",
            text: `Calculated portfolio diagnostics for ${snapshot.snapshotId} using calculation version ${diagnostics.calculationVersion}. Concentration metrics are descriptive, not target allocations.`
          }
        ]
      };
    }
  );

  registerAppTool(
    server,
    "render_portfolio_dashboard",
    {
      title: "Show portfolio dashboard",
      description:
        "Render the portfolio dashboard after the user asks to see or review portfolio structure. The widget displays the same read-only snapshot and exact diagnostics available from the data tools.",
      inputSchema: {},
      outputSchema: {
        snapshot: snapshotSchema,
        diagnostics: diagnosticsSchema
      },
      annotations: readOnlyAnnotations(),
      _meta: { ui: { resourceUri: PORTFOLIO_WIDGET_URI } }
    },
    async () => {
      const snapshot = await researchRepository.getLatestSnapshot();
      const diagnostics = portfolioDiagnostics(snapshot);
      return {
        structuredContent: { snapshot, diagnostics },
        content: [
          {
            type: "text",
            text: `Rendered portfolio dashboard for ${snapshot.snapshotId}. This is ${snapshot.fixture ? "fictional demo data" : "a portfolio snapshot"}, not live market data.`
          }
        ]
      };
    }
  );

  return server;
}

const port = Number(process.env.PORT ?? 8787);

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res
      .writeHead(200, { "content-type": "text/plain; charset=utf-8" })
      .end("AI Berkshire ChatGPT App MCP server");
    return;
  }

  const mcpMethods = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && mcpMethods.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createBerkshireServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.writeHead(500).end("Internal server error");
      }
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(
    `AI Berkshire MCP server listening on http://localhost:${port}${MCP_PATH}`
  );
});
