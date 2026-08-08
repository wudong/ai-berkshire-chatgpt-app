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
import { portfolioDiagnostics } from "./calculations.js";
import { researchRepository } from "./data.js";

const APP_NAME = "ai-berkshire-portfolio";
const APP_VERSION = "0.1.0";
const MCP_PATH = "/mcp";
const PORTFOLIO_WIDGET_URI = "ui://ai-berkshire/portfolio/v1.html";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, "..");

const decimalStringSchema = z.string().regex(/^\d+(?:\.\d+)?$/);
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
        "This app provides auditable investment research inputs, not trade execution or automatic recommendations. The backend owns portfolio facts and deterministic calculations; the model owns interpretation. Separate facts, analysis, and uncertainty. Never infer live market data from fixture values. Price movement alone is not a thesis change."
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

  registerAppTool(
    server,
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

  registerAppTool(
    server,
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
      _meta: {
        ui: { resourceUri: PORTFOLIO_WIDGET_URI }
      }
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
