import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

type Holding = {
  instrumentId: string;
  ticker: string;
  name: string;
  securityType: "equity" | "etf" | "cash" | "other";
  quantity: string;
  tradingCurrency: string;
  referenceMarketValueBase: string;
};

type PortfolioSnapshot = {
  snapshotId: string;
  asOf: string;
  baseCurrency: string;
  holdings: Holding[];
  cash: Array<{ currency: string; amountBase: string }>;
  fixture: boolean;
  warnings: string[];
};

type PortfolioDiagnostics = {
  snapshotId: string;
  asOf: string;
  baseCurrency: string;
  totalReferenceValueBase: string;
  investedReferenceValueBase: string;
  cashReferenceValueBase: string;
  cashWeightPct: string;
  holdings: Array<{
    instrumentId: string;
    ticker: string;
    weightPct: string;
  }>;
  largestHoldingPct: string;
  top3HoldingPct: string;
  holdingCount: number;
  warnings: string[];
  calculationVersion: string;
};

type ToolPayload = {
  structuredContent?: {
    snapshot?: PortfolioSnapshot;
    diagnostics?: PortfolioDiagnostics;
  };
};

let rpcId = 0;
let lastToolPayload: ToolPayload | undefined;
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
      lastToolPayload = message.params as ToolPayload;
      for (const subscriber of toolResultSubscribers) {
        subscriber(lastToolPayload);
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

const css = `
:root { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; background: transparent; }
.shell { padding: 16px; max-width: 900px; margin: 0 auto; }
.header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 14px; }
.title { font-size: 18px; font-weight: 700; margin: 0; }
.sub { font-size: 12px; opacity: .68; margin-top: 4px; }
.fixture { display:inline-block; margin-top:6px; border:1px solid rgba(127,127,127,.28); border-radius:999px; padding:3px 7px; font-size:11px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-bottom: 12px; }
.card { border: 1px solid rgba(127,127,127,.22); border-radius: 12px; padding: 12px; }
.metric { font-size: 22px; font-weight: 700; }
.label { font-size: 11px; opacity: .62; text-transform: uppercase; letter-spacing: .06em; }
.row { display: grid; grid-template-columns: 88px 1fr 90px 82px; gap: 8px; align-items: center; padding: 10px 0; border-top: 1px solid rgba(127,127,127,.14); }
.row:first-child { border-top: 0; }
.ticker { font-weight: 700; }
.company { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.right { text-align: right; }
.warning { margin-top: 8px; border: 1px solid rgba(127,127,127,.22); border-radius: 10px; padding: 10px; font-size: 12px; line-height: 1.4; }
button { border: 1px solid rgba(127,127,127,.28); border-radius: 9px; padding: 7px 10px; background: transparent; color: inherit; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
.empty { padding: 18px; text-align: center; opacity: .7; }
@media (max-width: 650px) { .grid { grid-template-columns: 1fr; } .row { grid-template-columns: 72px 1fr 64px; } .hide-small { display:none; } }
`;

function App() {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<PortfolioDiagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = (payload: ToolPayload | undefined) => {
    const content = payload?.structuredContent;
    if (content?.snapshot) setSnapshot(content.snapshot);
    if (content?.diagnostics) setDiagnostics(content.diagnostics);
  };

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const [snapshotResult, diagnosticsResult] = await Promise.all([
        callTool("get_portfolio_snapshot"),
        callTool("run_portfolio_diagnostics")
      ]);
      applyPayload(snapshotResult);
      applyPayload(diagnosticsResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh dashboard");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const subscriber = (payload: ToolPayload) => applyPayload(payload);
    toolResultSubscribers.add(subscriber);
    applyPayload(lastToolPayload);

    if (!lastToolPayload?.structuredContent?.snapshot) {
      void refresh();
    }

    return () => {
      toolResultSubscribers.delete(subscriber);
    };
  }, []);

  const weightByInstrument = useMemo(
    () =>
      new Map(
        diagnostics?.holdings.map((holding) => [
          holding.instrumentId,
          holding.weightPct
        ]) ?? []
      ),
    [diagnostics]
  );

  if (!snapshot) {
    return <div className="empty">{error ?? "Loading portfolio snapshot…"}</div>;
  }

  return (
    <div className="shell">
      <style>{css}</style>
      <div className="header">
        <div>
          <h1 className="title">AI Berkshire Portfolio</h1>
          <div className="sub">Snapshot {snapshot.asOf} · base {snapshot.baseCurrency}</div>
          {snapshot.fixture ? <span className="fixture">Fictional fixture · not live data</span> : null}
        </div>
        <button onClick={() => void refresh()} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>

      <div className="grid">
        <div className="card"><div className="label">Cash weight</div><div className="metric">{diagnostics ? `${diagnostics.cashWeightPct}%` : "—"}</div></div>
        <div className="card"><div className="label">Largest holding</div><div className="metric">{diagnostics ? `${diagnostics.largestHoldingPct}%` : "—"}</div></div>
        <div className="card"><div className="label">Top 3 holdings</div><div className="metric">{diagnostics ? `${diagnostics.top3HoldingPct}%` : "—"}</div></div>
      </div>

      <div className="card">
        {snapshot.holdings.map((holding) => (
          <div className="row" key={holding.instrumentId}>
            <div className="ticker">{holding.ticker}</div>
            <div className="company">{holding.name}</div>
            <div className="right">{weightByInstrument.get(holding.instrumentId) ? `${weightByInstrument.get(holding.instrumentId)}%` : "—"}</div>
            <div className="right hide-small">{holding.securityType}</div>
          </div>
        ))}
      </div>

      {snapshot.warnings.map((warning, index) => (
        <div className="warning" key={index}>{warning}</div>
      ))}
      {error ? <div className="warning"><strong>Error: </strong>{error}</div> : null}
      {diagnostics ? <div className="sub" style={{ marginTop: 10 }}>Calculation engine {diagnostics.calculationVersion}; weights are backend-calculated decimal values.</div> : null}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
