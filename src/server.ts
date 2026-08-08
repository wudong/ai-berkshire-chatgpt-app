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
import { compareOpportunity, reviewPortfolio } from "./analysis.js";
import { loadPortfolio, loadThesis } from "./data.js";

const APP_NAME = "ai-berkshire-portfolio";
const APP_VERSION = "0.1.0";
const MCP_PATH = "/mcp";
const PORTFOLIO_WIDGET_URI = "ui://ai-berkshire/portfolio/v1.html";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");

const thesisStatusSchema = z.enum(["GREEN", "YELLOW", "RED", "BROKEN"]);
const assumptionStatusSchema = z.enum([
  "INTACT",
  "WEAKENING",
  "BROKEN",
  "UNKNOWN"
]);

const holdingOutputSchema = z.object({
  ticker: z.string(),
  company: z.string(),
  market: z.string(),
  currency: z.string(),
  shares: z.number(),
  averageCost: z.number(),
  referencePrice: z.number(),
  weightPct: z.number(),
  thesisStatus: thesisStatusSchema,
  conviction: z.number(),
  ownerEarningsYieldPct: z.number().optional(),
  expectedGrowthPct: z.number().optional()
});

const portfolioOutputSchema = z.object({
  asOf: z.string(),
  baseCurrency: z.string(),
  cashPct: z.number(),
  holdings: z.array(holdingOutputSchema),
  notes: z.array(z.string()).optional()
});

const thesisOutputSchema = z.object({
  ticker: z.string(),
  company: z.string(),
  status: thesisStatusSchema,
  lastReviewed: z.string(),
  businessEssence: z.string(),
  moat: z.string(),
  management: z.string(),
  valuation: z.string(),
  downsideControl: z.string(),
  assumptions: z.array(
    z.object({
      id: z.string(),
      statement: z.string(),
      status: assumptionStatusSchema,
      evidence: z.string().optional()
    })
  ),
  redLines: z.array(z.string()),
  whatWouldChangeOurMind: z.array(z.string())
});

const reviewOutputSchema = z.object({
  asOf: z.string(),
  defaultAction: z.literal("NO_ACTION"),
  concentration: z.object({
    largestHoldingPct: z.number(),
    top3Pct: z.number(),
    holdingCount: z.number(),
    cashPct: z.number()
  }),
  thesisSummary: z.object({
    GREEN: z.number(),
    YELLOW: z.number(),
    RED: z.number(),
    BROKEN: z.number()
  }),
  opportunityRanking: z.array(
    z.object({
      ticker: z.string(),
      estimatedAnnualReturnPct: z.number().nullable(),
      conviction: z.number(),
      thesisStatus: thesisStatusSchema
    })
  ),
  alerts: z.array(
    z.object({
      severity: z.enum(["INFO", "WATCH", "HIGH"]),
      ticker: z.string().optional(),
      message: z.string()
    })
  ),
  methodologyNote: z.string()
});

const comparisonOutputSchema = z.object({
  candidate: z.object({
    ticker: z.string(),
    estimatedAnnualReturnPct: z.number(),
    conviction: z.number(),
    thesisStatus: thesisStatusSchema
  }),
  bestExisting: z
    .object({
      ticker: z.string(),
      estimatedAnnualReturnPct: z.number(),
      conviction: z.number()
    })
    .nullable(),
  weakestExisting: z
    .object({
      ticker: z.string(),
      estimatedAnnualReturnPct: z.number(),
      conviction: z.number()
    })
    .nullable(),
  cashHurdlePct: z.number(),
  researchVerdict: z.enum(["RESEARCH_FURTHER", "WATCH", "PASS"]),
  rationale: z.array(z.string()),
  methodologyNote: z.string()
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
        "Decision-support only. Separate facts, analysis, and uncertainty. Never infer live market data. Treat portfolio/thesis records as user-maintained snapshots. Prefer NO ACTION when evidence is insufficient. Compare opportunity cost and thesis red lines; price movement alone is not a thesis change."
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
          _meta: {
            ui: {
              prefersBorder: true
            }
          }
        }
      ]
    })
  );

  registerAppTool(
    server,
    "get_portfolio",
    {
      title: "Get portfolio",
      description:
        "Use when the user wants to inspect their current portfolio snapshot, holdings, weights, thesis states, or cash allocation. This v0 reads local user-maintained data and does not fetch live prices.",
      inputSchema: {},
      outputSchema: { portfolio: portfolioOutputSchema },
      annotations: readOnlyAnnotations(),
      _meta: {
        ui: { resourceUri: PORTFOLIO_WIDGET_URI }
      }
    },
    async () => {
      const portfolio = await loadPortfolio();
      return {
        structuredContent: { portfolio },
        content: [
          {
            type: "text",
            text: `Loaded portfolio snapshot as of ${portfolio.asOf} with ${portfolio.holdings.length} holdings and ${portfolio.cashPct}% cash.`
          }
        ]
      };
    }
  );

  registerAppTool(
    server,
    "get_company_thesis",
    {
      title: "Get company thesis",
      description:
        "Use when the user asks why a portfolio company is owned, whether its thesis is intact, which assumptions are weakening, or what red lines would invalidate the investment case.",
      inputSchema: {
        ticker: z.string().min(1).describe("Ticker symbol in the local thesis store")
      },
      outputSchema: { thesis: thesisOutputSchema.nullable() },
      annotations: readOnlyAnnotations()
    },
    async ({ ticker }) => {
      const thesis = await loadThesis(ticker);
      if (!thesis) {
        return {
          structuredContent: { thesis: null },
          content: [
            {
              type: "text",
              text: `No local thesis was found for ${ticker.toUpperCase()}. Do not invent one; ask for or research the missing evidence.`
            }
          ]
        };
      }

      return {
        structuredContent: { thesis },
        content: [
          {
            type: "text",
            text: `${thesis.ticker} thesis status is ${thesis.status}; last reviewed ${thesis.lastReviewed}.`
          }
        ]
      };
    }
  );

  registerAppTool(
    server,
    "review_portfolio",
    {
      title: "Review portfolio",
      description:
        "Use for a Berkshire-style portfolio health review: concentration, thesis health, opportunity-cost ranking, and conditions that deserve deeper research. It does not make trades or use live market data.",
      inputSchema: {},
      outputSchema: { review: reviewOutputSchema },
      annotations: readOnlyAnnotations(),
      _meta: {
        ui: { resourceUri: PORTFOLIO_WIDGET_URI }
      }
    },
    async () => {
      const portfolio = await loadPortfolio();
      const review = reviewPortfolio(portfolio);
      return {
        structuredContent: { review, portfolio },
        content: [
          {
            type: "text",
            text: `Portfolio review complete. Default action: ${review.defaultAction}. Found ${review.alerts.length} item(s) worth attention.`
          }
        ]
      };
    }
  );

  registerAppTool(
    server,
    "evaluate_opportunity",
    {
      title: "Compare an investment opportunity",
      description:
        "Use after the user supplies explicit assumptions for a candidate. Compare its simplified owner-earnings-yield plus growth return estimate against cash and modeled existing holdings. This is a research triage tool, not a buy/sell signal.",
      inputSchema: {
        ticker: z.string().min(1),
        company: z.string().min(1),
        ownerEarningsYieldPct: z.number(),
        expectedGrowthPct: z.number(),
        conviction: z.number().min(1).max(10),
        thesisStatus: thesisStatusSchema,
        cashHurdlePct: z.number().min(0)
      },
      outputSchema: { comparison: comparisonOutputSchema },
      annotations: readOnlyAnnotations()
    },
    async (candidate) => {
      const portfolio = await loadPortfolio();
      const comparison = compareOpportunity(portfolio, candidate);
      return {
        structuredContent: { comparison },
        content: [
          {
            type: "text",
            text: `${candidate.ticker.toUpperCase()} research classification: ${comparison.researchVerdict}. The result is based only on supplied assumptions and the local portfolio snapshot.`
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
      transport.close();
      server.close();
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
