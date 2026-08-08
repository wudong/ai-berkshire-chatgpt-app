import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type ThesisStatus = "GREEN" | "YELLOW" | "RED" | "BROKEN";

type Holding = {
  ticker: string;
  company: string;
  weightPct: number;
  thesisStatus: ThesisStatus;
  conviction: number;
  ownerEarningsYieldPct?: number;
  expectedGrowthPct?: number;
};

type Portfolio = {
  asOf: string;
  baseCurrency: string;
  cashPct: number;
  holdings: Holding[];
  notes?: string[];
};

type Review = {
  defaultAction: "NO_ACTION";
  concentration: {
    largestHoldingPct: number;
    top3Pct: number;
    holdingCount: number;
    cashPct: number;
  };
  alerts: Array<{
    severity: "INFO" | "WATCH" | "HIGH";
    ticker?: string;
    message: string;
  }>;
};

type ToolPayload = {
  structuredContent?: {
    portfolio?: Portfolio;
    review?: Review;
  };
};

let rpcId = 0;
const pending = new Map<
  number,
  { resolve: (value: any) => void; reject: (reason?: any) => void }
>();
const toolResultSubscribers = new Set<(payload: ToolPayload) => void>();

function rpcNotify(method: string, params: unknown) {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}

function rpcRequest(method: string, params: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pending.set(id, { resolve, reject });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
}

window.addEventListener(
  "message",
  (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;

    if (typeof message.id === "number") {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(message.error);
      else request.resolve(message.result);
      return;
    }

    if (message.method === "ui/notifications/tool-result") {
      for (const subscriber of toolResultSubscribers) {
        subscriber(message.params as ToolPayload);
      }
    }
  },
  { passive: true }
);

const bridgeReady = (async () => {
  await rpcRequest("ui/initialize", {
    appInfo: { name: "ai-berkshire-portfolio-widget", version: "0.1.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26"
  });
  rpcNotify("ui/notifications/initialized", {});
})();

async function callTool(name: string, args: Record<string, unknown> = {}) {
  await bridgeReady;
  return rpcRequest("tools/call", { name, arguments: args });
}

function statusMark(status: ThesisStatus) {
  return {
    GREEN: "●",
    YELLOW: "▲",
    RED: "!",
    BROKEN: "×"
  }[status];
}

const css = `
:root { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; background: transparent; }
.shell { padding: 16px; max-width: 900px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 14px; }
.title { font-size: 18px; font-weight: 700; margin: 0; }
.sub { font-size: 12px; opacity: .68; margin-top: 4px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-bottom: 12px; }
.card { border: 1px solid rgba(127,127,127,.22); border-radius: 12px; padding: 12px; }
.metric { font-size: 22px; font-weight: 700; }
.label { font-size: 11px; opacity: .62; text-transform: uppercase; letter-spacing: .06em; }
.row { display: grid; grid-template-columns: 88px 1fr 72px 90px 80px; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid rgba(127,127,127,.14); }
.row:first-child { border-top: 0; }
.ticker { font-weight: 700; }
.company { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right { text-align: right; }
.alert { margin-top: 8px; border: 1px solid rgba(127,127,127,.22); border-radius: 10px; padding: 10px; font-size: 12px; line-height: 1.4; }
.alert strong { margin-right: 6px; }
button { border: 1px solid rgba(127,127,127,.28); border-radius: 9px; padding: 7px 10px; background: transparent; color: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.empty { padding: 18px; text-align: center; opacity: .7; }
@media (max-width: 650px) { .grid { grid-template-columns: 1fr; } .row { grid-template-columns: 72px 1fr 58px; } .hide-small { display:none; } }
`;

function App() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = (payload: ToolPayload | undefined) => {
    const content = payload?.structuredContent;
    if (content?.portfolio) setPortfolio(content.portfolio);
    if (content?.review) setReview(content.review);
  };

  useEffect(() => {
    const subscriber = (payload: ToolPayload) => applyPayload(payload);
    toolResultSubscribers.add(subscriber);

    void (async () => {
      try {
        const response = await callTool("get_portfolio");
        applyPayload(response);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to load portfolio");
      }
    })();

    return () => {
      toolResultSubscribers.delete(subscriber);
    };
  }, []);

  const investedPct = useMemo(
    () => portfolio?.holdings.reduce((sum, holding) => sum + holding.weightPct, 0) ?? 0,
    [portfolio]
  );

  const runReview = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await callTool("review_portfolio");
      applyPayload(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Portfolio review failed");
    } finally {
      setBusy(false);
    }
  };

  if (!portfolio) {
    return <div className="empty">{error ?? "Loading portfolio…"}</div>;
  }

  return (
    <div className="shell">
      <style>{css}</style>
      <div className="header">
        <div>
          <h1 className="title">AI Berkshire Portfolio</h1>
          <div className="sub">Snapshot {portfolio.asOf} · {portfolio.baseCurrency} · local data only</div>
        </div>
        <button onClick={runReview} disabled={busy}>{busy ? "Reviewing…" : "Run review"}</button>
      </div>

      <div className="grid">
        <div className="card"><div className="label">Invested</div><div className="metric">{investedPct.toFixed(1)}%</div></div>
        <div className="card"><div className="label">Cash</div><div className="metric">{portfolio.cashPct.toFixed(1)}%</div></div>
        <div className="card"><div className="label">Default action</div><div className="metric">{review?.defaultAction ?? "—"}</div></div>
      </div>

      <div className="card">
        {portfolio.holdings.map((holding) => (
          <div className="row" key={holding.ticker}>
            <div className="ticker">{holding.ticker}</div>
            <div className="company">{holding.company}</div>
            <div className="right">{holding.weightPct.toFixed(1)}%</div>
            <div className="right hide-small">{statusMark(holding.thesisStatus)} {holding.thesisStatus}</div>
            <div className="right hide-small">{holding.conviction}/10</div>
          </div>
        ))}
      </div>

      {review?.alerts.map((alert, index) => (
        <div className="alert" key={`${alert.ticker ?? "portfolio"}-${index}`}>
          <strong>{alert.severity}{alert.ticker ? ` · ${alert.ticker}` : ""}</strong>
          {alert.message}
        </div>
      ))}

      {error ? <div className="alert"><strong>Error</strong>{error}</div> : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
