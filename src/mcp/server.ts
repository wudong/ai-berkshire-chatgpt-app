import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import {
  portfolioDiagnostics,
  validateFinancialMetric,
  verifyMarketCap,
  verifyValuation,
} from '../calculations.js';
import { researchRepository } from '../data.js';

const PORTFOLIO_WIDGET_URI = 'ui://ai-berkshire/portfolio/v1.html';
const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';
const decimalStringSchema = z.string().regex(/^-?(?:\d+(?:\.\d*)?|\.\d+)$/);

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function asToolResult(result: unknown, summary?: string) {
  return {
    content: [{ type: 'text' as const, text: summary ?? JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

function widgetHtml(): string {
  try {
    const bundle = readFileSync(path.join(process.cwd(), 'web/dist/widget.js'), 'utf8');
    return `<div id="root"></div><script type="module">${bundle}</script>`;
  } catch {
    return '<!doctype html><html><body style="font-family:system-ui;padding:16px"><strong>Portfolio widget is not built.</strong><p>Run <code>bun run build:widget</code>, then restart the MCP server.</p></body></html>';
  }
}

export function createBerkshireMcpHandler() {
  return createMcpHandler(() => {
    const server = new McpServer(
      { name: 'ai-berkshire-mcp', version: '0.2.0' },
      {
        instructions:
          'Private US-stock investment research service. ChatGPT gathers current evidence from Macrotrends, StockAnalysis, SEC filings, company investor relations, and the web. Use deterministic financial-rigor tools for arithmetic and cross-source checks. Separate facts, analysis, and uncertainty. Never infer live data from portfolio fixtures, never treat a price move alone as a thesis change, and do not execute trades.',
      },
    );

    server.registerResource(
      'portfolio-dashboard',
      PORTFOLIO_WIDGET_URI,
      { mimeType: RESOURCE_MIME_TYPE },
      async () => ({
        contents: [
          {
            uri: PORTFOLIO_WIDGET_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: widgetHtml(),
            _meta: { ui: { prefersBorder: true } },
          },
        ],
      }),
    );

    server.registerTool(
      'get_portfolio_snapshot',
      {
        description:
          'Load the current portfolio snapshot for research. Values are portfolio state, not live market quotes. The checked-in implementation uses fictional fixtures.',
        inputSchema: z.object({}),
        annotations: readOnlyAnnotations,
      },
      async () => {
        const snapshot = await researchRepository.getLatestSnapshot();
        return asToolResult(
          { snapshot },
          `Loaded ${snapshot.fixture ? 'fictional fixture' : 'portfolio'} snapshot ${snapshot.snapshotId} as of ${snapshot.asOf}.`,
        );
      },
    );

    server.registerTool(
      'get_thesis',
      {
        description:
          'Load the latest explicit investment thesis for a ticker, including the five-sentence thesis, falsifiable assumptions, statuses, and review triggers.',
        inputSchema: z.object({ ticker: z.string().trim().min(1) }),
        annotations: readOnlyAnnotations,
      },
      async ({ ticker }) => {
        const thesis = await researchRepository.getLatestByTicker(ticker);
        return asToolResult(
          { thesis },
          thesis
            ? `${thesis.ticker} thesis v${thesis.version} status: ${thesis.status}.`
            : `No thesis exists for ${ticker.toUpperCase()}.`,
        );
      },
    );

    server.registerTool(
      'run_portfolio_diagnostics',
      {
        description:
          'Calculate exact portfolio weights, cash weight, largest-position weight, top-three weight, and data warnings. Descriptive only; it does not impose target allocations.',
        inputSchema: z.object({}),
        annotations: readOnlyAnnotations,
      },
      async () => {
        const snapshot = await researchRepository.getLatestSnapshot();
        const diagnostics = portfolioDiagnostics(snapshot);
        return asToolResult({ diagnostics });
      },
    );

    server.registerTool(
      'verify_market_cap',
      {
        description:
          'Verify market cap using exact decimal arithmetic: current price × shares outstanding versus a reported market cap. <=1% discrepancy passes, >1% to <=5% warns, >5% fails and should be checked against SEC/company primary evidence.',
        inputSchema: z.object({
          price: decimalStringSchema,
          sharesOutstanding: decimalStringSchema,
          reportedMarketCap: decimalStringSchema,
          currency: z.string().trim().min(1).default('USD'),
        }),
        annotations: readOnlyAnnotations,
      },
      async ({ price, sharesOutstanding, reportedMarketCap, currency }) =>
        asToolResult({
          verification: verifyMarketCap(price, sharesOutstanding, reportedMarketCap, currency),
        }),
    );

    server.registerTool(
      'validate_financial_metric',
      {
        description:
          'Cross-check one financial metric from at least two independently gathered sources such as Macrotrends, StockAnalysis, and SEC filings. Uses the exact median reference and AI Berkshire policy bands: <=1% pass, >1% to <=5% warning, >5% fail.',
        inputSchema: z.object({
          field: z.string().trim().min(1),
          sourceValues: z.record(z.string().min(1), decimalStringSchema),
          unit: z.string().default(''),
        }),
        annotations: readOnlyAnnotations,
      },
      async ({ field, sourceValues, unit }) =>
        asToolResult({ validation: validateFinancialMetric(field, sourceValues, unit) }),
    );

    server.registerTool(
      'verify_valuation',
      {
        description:
          'Calculate valuation ratios from explicit inputs using exact decimal arithmetic. Missing inputs remain missing. Returns PE, earnings yield, PB, ROE, P/FCF, FCF yield, and dividend yield when the required values are supplied.',
        inputSchema: z.object({
          price: decimalStringSchema,
          eps: decimalStringSchema.optional(),
          bookValuePerShare: decimalStringSchema.optional(),
          fcfPerShare: decimalStringSchema.optional(),
          dividendPerShare: decimalStringSchema.optional(),
        }),
        annotations: readOnlyAnnotations,
      },
      async (input) => asToolResult({ valuation: verifyValuation(input) }),
    );

    server.registerTool(
      'render_portfolio_dashboard',
      {
        description:
          'Render the read-only portfolio dashboard after the user asks to see or review portfolio structure.',
        inputSchema: z.object({}),
        annotations: readOnlyAnnotations,
        _meta: {
          ui: { resourceUri: PORTFOLIO_WIDGET_URI },
          'ui/resourceUri': PORTFOLIO_WIDGET_URI,
        },
      },
      async () => {
        const snapshot = await researchRepository.getLatestSnapshot();
        const diagnostics = portfolioDiagnostics(snapshot);
        return asToolResult(
          { snapshot, diagnostics },
          `Rendered portfolio dashboard for ${snapshot.snapshotId}.`,
        );
      },
    );

    return server;
  });
}
