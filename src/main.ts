import { requireMcpAuth } from '@better-auth/mcp';
import { Hono } from 'hono';
import { createAuth } from './auth/auth.js';
import { hasRequiredScope, insufficientScopeResponse, type AccessTokenClaims } from './auth/scopes.js';
import { loadConfig } from './config.js';
import { consentPage, signInPage } from './http/pages.js';
import { createBerkshireMcpHandler } from './mcp/server.js';

const config = loadConfig();
const auth = createAuth(config);
const mcpHandler = createBerkshireMcpHandler();

const protectedMcp = requireMcpAuth(
  auth,
  (request, claims) => {
    if (!hasRequiredScope(claims as AccessTokenClaims | undefined, 'investing:access')) {
      return insufficientScopeResponse('investing:access', config.resourceUrl);
    }
    return mcpHandler.fetch(request);
  },
  { resource: config.resourceUrl },
);

const app = new Hono();

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  await next();
});

app.get('/healthz', (c) => c.json({ ok: true, service: 'ai-berkshire-mcp', runtime: 'bun' }));
app.get('/sign-in', (c) => c.html(signInPage()));
app.get('/consent', (c) => c.html(consentPage(c.req.query('client_id') ?? 'unknown client', c.req.query('scope') ?? 'investing:access')));

app.all('/api/auth/*', (c) => auth.handler(c.req.raw));
app.all('/.well-known/*', (c) => auth.handler(c.req.raw));
app.post('/mcp', (c) => protectedMcp(c.req.raw));
app.all('/mcp', (c) => c.json({ error: 'method_not_allowed' }, 405));

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'http_error', message: error.message }));
  return c.json({ error: 'internal_error' }, 500);
});

const server = Bun.serve({
  fetch: app.fetch,
  port: config.port,
  hostname: '127.0.0.1',
});

console.log(JSON.stringify({
  event: 'server_started',
  hostname: server.hostname,
  port: server.port,
  resource: config.resourceUrl,
  runtime: `bun-${Bun.version}`,
}));
