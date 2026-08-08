# AI Berkshire ChatGPT App

A private ChatGPT/MCP adaptation of [`xbtlin/ai-berkshire`](https://github.com/xbtlin/ai-berkshire), currently focused on **US-listed operating-company stocks only**.

> **Current direction:** stay close to how the original AI Berkshire repo works. ChatGPT gathers research from the web; the MCP app provides portfolio/thesis state and deterministic financial calculations. We are deliberately not building a market-data provider framework yet.

## Current workflow

```text
User: "Research GOOG"
        |
        v
ChatGPT web research
        |
        +-- Macrotrends
        +-- StockAnalysis
        +-- SEC 10-K / 10-Q / 8-K
        +-- Company investor relations
        +-- Web/news for competitors, management, risks, bull/bear cases
        |
        v
MCP financial-rigor tools
        |
        +-- verify_market_cap
        +-- validate_financial_metric
        +-- verify_valuation
        |
        v
ChatGPT investment reasoning
        |
        +-- business essence
        +-- moat
        +-- inversion / bear case
        +-- management
        +-- long-term industry position
        +-- valuation / margin of safety
        |
        v
Research memo
```

This intentionally mirrors the original repo's US-stock flow: the agent is the integration/research layer, while deterministic code checks important arithmetic.

## Runtime

The service is Bun-native. Bun `1.3.14` is pinned in `.bun-version` and is used as the package manager, test runner, bundler, script runner, and production runtime.

The HTTP edge is Hono on `Bun.serve`, bound to loopback only in production. Better Auth provides OAuth for the MCP resource using Google as the upstream identity provider. PostgreSQL stores Better Auth state.

Production shape:

```text
ChatGPT / MCP client
        |
        | HTTPS + OAuth 2.1
        v
Cloudflare Tunnel
        |
        v
127.0.0.1:3020
        |
        +-- /mcp
        +-- /api/auth/*
        +-- /.well-known/*
        +-- /sign-in
        +-- /consent
        +-- /healthz
```

## Authentication

Authentication mirrors the existing `gcloud/vps-investigation-mcp` service:

- Better Auth + `@better-auth/mcp`;
- Google OAuth as the only upstream sign-in provider;
- OAuth Dynamic Client Registration enabled for MCP clients;
- verified Google email required;
- one allowlisted Google email;
- optional immutable Google `sub` pinning;
- account linking disabled;
- 10-minute MCP access tokens;
- 30-day refresh tokens;
- resource-bound MCP OAuth flow;
- one application scope: `investing:access`.

The custom `investing:access` scope is issued by this MCP service. It is not a Google API scope.

### Google OAuth client

Create a Google OAuth **Web application** client, or add the new callback to an existing client, with this authorised redirect URI:

```text
https://<MCP_HOSTNAME>/api/auth/callback/google
```

The canonical Better Auth origin is:

```text
https://<MCP_HOSTNAME>
```

The MCP resource is:

```text
https://<MCP_HOSTNAME>/mcp
```

For isolation between services, a separate Google OAuth client is preferred even though Google allows multiple redirect URIs on one web client.

## US-stock source policy

For material financial facts:

1. **Macrotrends** — main secondary source.
2. **StockAnalysis** — independent secondary cross-check.
3. **SEC EDGAR / company filings** — authoritative primary source when figures differ and for critical facts.
4. **Company investor relations** — earnings releases, presentations, management commentary.
5. General web/news research for qualitative context only.

Important metrics should be checked against at least two sources.

Discrepancy policy, following the original AI Berkshire written financial-data rules:

- `<= 1%` — pass;
- `> 1% and <= 5%` — warning; investigate units/accounting/timing;
- `> 5%` — fail; check SEC/company primary filing before continuing.

## MCP tools

### Portfolio / thesis

- `get_portfolio_snapshot`
- `get_thesis`
- `run_portfolio_diagnostics`
- `render_portfolio_dashboard`

The checked-in portfolio/thesis fixtures are fictional. Real holdings must not be committed to this public repo.

### Financial rigor

- `verify_market_cap`
  - exact `price × shares` calculation;
  - comparison with reported market cap;
  - pass/warning/fail discrepancy classification.

- `validate_financial_metric`
  - takes named source values, e.g. Macrotrends / StockAnalysis / SEC;
  - uses the exact median as the reference, matching the original repo's cross-validation approach;
  - applies the documented 1%/5% policy bands.

- `verify_valuation`
  - PE;
  - earnings yield;
  - PB;
  - ROE when EPS and book value are supplied;
  - P/FCF;
  - FCF yield;
  - dividend yield;
  - missing inputs remain missing.

All financial inputs and outputs use decimal strings and `decimal.js`; production financial calculations do not use JavaScript binary floating-point arithmetic.

## ChatGPT research sequence

For a US stock research request, the intended sequence is:

1. State the data cutoff date.
2. Rate information richness (A/B/C), following AI Berkshire.
3. Gather current and historical facts from Macrotrends and StockAnalysis.
4. Read the latest SEC filing / company IR material for primary-source confirmation.
5. Validate at minimum current price, shares outstanding, market cap, annual revenue, annual net income, cash / short-term investments, debt / net cash, and free cash flow.
6. Run the MCP financial-rigor tools.
7. Only then perform the Buffett / Munger / Duan Yongping / Li Lu qualitative analysis.
8. Separate `FACT`, `ANALYSIS`, and `UNCERTAINTY` in the final memo.
9. Include the strongest counterargument and what evidence would falsify the thesis.

## Local development

Requirements:

- Bun 1.3.14+
- PostgreSQL
- a Google OAuth web client if exercising the full browser OAuth flow

Copy the environment template and configure a local/test database:

```bash
cp .env.example .env
bun install --frozen-lockfile
bun run auth:migrate
bun run check
bun run dev
```

The application binds to `127.0.0.1:3020` by default. The local health endpoint is:

```text
http://127.0.0.1:3020/healthz
```

For a real OAuth/MCP client connection, `BETTER_AUTH_URL` and `MCP_RESOURCE_URL` should use the HTTPS hostname whose callback is registered with Google.

## Automated VPS deployment

Deployment mirrors the `tt-players` production credential model: GitHub Actions receives a short-lived identity through Google Workload Identity Federation, and confidential delivery values are loaded from Google Secret Manager. Long-lived production credentials are not stored in this repository's GitHub Actions secrets.

Every push to `main` runs the quality gate. Production deploy mode then:

1. installs the committed Bun dependency graph with `bun install --frozen-lockfile`;
2. runs TypeScript checks, Bun tests, server/widget builds, and deployment-script validation;
3. authenticates GitHub Actions to `wudong-agent-master` with OIDC/WIF;
4. reads the explicitly allowlisted shared VPS/Cloudflare credentials from Secret Manager;
5. connects to the VPS using the repository-configured pinned SSH host key;
6. uploads a versioned release to `/opt/ai-berkshire-mcp/releases/<commit-sha>`;
7. provisions a dedicated `ai-berkshire-mcp` Unix service user and local PostgreSQL role/database;
8. writes the root-owned runtime environment under `/etc/ai-berkshire-mcp`;
9. generates the PostgreSQL password and Better Auth secret once on the VPS, rather than transporting them through CI;
10. runs Better Auth migrations;
11. atomically switches `/opt/ai-berkshire-mcp/current` while retaining `previous`;
12. restarts the hardened `ai-berkshire-mcp.service` systemd unit;
13. verifies `http://127.0.0.1:3020/healthz` and automatically restores the previous release if the new release fails;
14. adds/updates this hostname in the existing Cloudflare tunnel without replacing unrelated ingress entries;
15. creates/updates the proxied DNS CNAME and verifies `https://<MCP_HOSTNAME>/healthz` externally.

A manual rollback workflow is provided in `.github/workflows/rollback.yml` and uses a separate, narrower WIF reader.

### Safe WIF/VPS canary

Manual `workflow_dispatch` defaults to `mode=canary`. The canary performs no production mutation. It proves:

- GitHub OIDC can exchange into the AI Berkshire WIF provider;
- the deploy reader can read its shared Secret Manager allowlist;
- the shared VPS deployment key works with the pinned host key;
- `cloudflared` and `postgresql` are active on the VPS.

It does not upload a release, write runtime configuration, restart services, or modify Cloudflare.

### GCloud dependency

The repository-specific WIF/IAM boundary is managed in `wudong/gcloud`. Terraform owns only the identity/IAM resources and the Secret Manager **container** for the AI Berkshire Google OAuth client secret; secret versions remain out of Terraform state.

The deploy reader reuses these existing shared Secret Manager values:

- `tt-players-hetzner-vps-deploy-key`;
- `cloudflare-account-id`;
- `ttlive-domain-cloudflare-tunnel-api-token`.

The app-specific secret is:

- `ai-berkshire-google-oauth-client-secret`.

### Required repository Variables

WIF outputs from the GCloud Terraform apply:

- `AI_BERKSHIRE_DEPLOY_WIF_PROVIDER`;
- `AI_BERKSHIRE_DEPLOY_SERVICE_ACCOUNT`;
- `AI_BERKSHIRE_ROLLBACK_WIF_PROVIDER`;
- `AI_BERKSHIRE_ROLLBACK_SERVICE_ACCOUNT`.

Shared/public deployment configuration:

- `AI_BERKSHIRE_VPS_HOST`;
- `AI_BERKSHIRE_VPS_USER`;
- `AI_BERKSHIRE_VPS_HOST_KEY`;
- `AI_BERKSHIRE_MCP_HOSTNAME`;
- `AI_BERKSHIRE_CLOUDFLARE_ZONE_ID`;
- `AI_BERKSHIRE_CLOUDFLARE_TUNNEL_ID`;
- `AI_BERKSHIRE_GOOGLE_CLIENT_ID`;
- `AI_BERKSHIRE_ALLOWED_GOOGLE_EMAIL`;
- `AI_BERKSHIRE_ALLOWED_GOOGLE_SUB` — optional but recommended.

The Cloudflare tunnel is shared safely: the deployment script changes only the ingress entry for `AI_BERKSHIRE_MCP_HOSTNAME` and leaves unrelated hostnames untouched.

## Production isolation

This service intentionally does not share application state with the VPS diagnostic MCP:

- systemd unit: `ai-berkshire-mcp.service`;
- Unix user: `ai-berkshire-mcp`;
- application root: `/opt/ai-berkshire-mcp`;
- config root: `/etc/ai-berkshire-mcp`;
- state root: `/var/lib/ai-berkshire-mcp`;
- PostgreSQL database/role: `ai_berkshire_mcp`;
- loopback port: `3020`.

It may share the same VPS and Cloudflare tunnel infrastructure.

## Safety boundary

The application must not:

- place or route trades;
- turn a score directly into an execution instruction;
- buy because a price fell or sell because it rose;
- silently invent missing financial facts;
- continue past a major source discrepancy without checking primary evidence.

This is an investment research and decision-support application, not an autonomous trading system.

## Current milestone

See [Issue #1](https://github.com/wudong/ai-berkshire-chatgpt-app/issues/1): **Mirror original AI Berkshire US-stock research workflow**.

After the authenticated MCP is deployed and connected to ChatGPT, the next application steps are:

1. test the financial-rigor tools from ChatGPT;
2. add the original-style three-scenario valuation helper;
3. test one real US company end-to-end;
4. refine tool descriptions/prompts based on actual ChatGPT behavior;
5. only then decide whether any automated data adapter is necessary.

## Existing design docs

The earlier architecture/provider documents remain in `docs/` as longer-term design ideas, but **Issue #1 and this README define the current implementation direction**. Provider/evidence-store work is intentionally deferred.

## License

The source AI Berkshire project is MIT licensed. Preserve the original copyright/license notice when substantially adapting its code or documentation.
