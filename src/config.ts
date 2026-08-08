export type AppConfig = {
  port: number;
  baseUrl: string;
  resourceUrl: string;
  databaseUrl: string;
  betterAuthSecret: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedGoogleEmail: string;
  allowedGoogleSub?: string;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`missing required environment variable: ${name}`);
  return value;
}

function positiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const baseUrl = required(env, 'BETTER_AUTH_URL').replace(/\/$/, '');
  const resourceUrl = (env.MCP_RESOURCE_URL?.trim() || `${baseUrl}/mcp`).replace(/\/$/, '');
  return {
    port: positiveInt(env.PORT, 3020, 'PORT'),
    baseUrl,
    resourceUrl,
    databaseUrl: required(env, 'DATABASE_URL'),
    betterAuthSecret: required(env, 'BETTER_AUTH_SECRET'),
    googleClientId: required(env, 'GOOGLE_CLIENT_ID'),
    googleClientSecret: required(env, 'GOOGLE_CLIENT_SECRET'),
    allowedGoogleEmail: required(env, 'ALLOWED_GOOGLE_EMAIL').toLowerCase(),
    ...(env.ALLOWED_GOOGLE_SUB?.trim() ? { allowedGoogleSub: env.ALLOWED_GOOGLE_SUB.trim() } : {}),
  };
}
