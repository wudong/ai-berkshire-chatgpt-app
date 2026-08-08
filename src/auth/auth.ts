import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { jwt } from 'better-auth/plugins';
import { Pool } from 'pg';
import type { AppConfig } from '../config.js';

export function createAuth(config: AppConfig) {
  const database = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  const deny = (message: string): never => {
    throw new APIError('FORBIDDEN', { message });
  };

  const mcpPlugin = mcp({
    loginPage: '/sign-in',
    consentPage: '/consent',
    resource: config.resourceUrl,
    scopes: ['openid', 'profile', 'email', 'offline_access', 'investing:access'],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    enforcePerClientResources: false,
    accessTokenExpiresIn: 10 * 60,
    refreshTokenExpiresIn: 30 * 24 * 60 * 60,
    codeExpiresIn: 5 * 60,
    refreshTokenReuseInterval: 0,
  }) as unknown as ReturnType<typeof jwt>;

  return betterAuth({
    appName: 'AI Berkshire MCP',
    baseURL: config.baseUrl,
    secret: config.betterAuthSecret,
    database,
    trustedOrigins: [config.baseUrl],
    session: {
      cookieCache: { enabled: true, maxAge: 300 },
    },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        includeGrantedScopes: false,
        prompt: 'select_account',
      },
    },
    account: {
      accountLinking: { enabled: false },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (user.email.toLowerCase() !== config.allowedGoogleEmail) deny('Google account is not allowlisted');
            if (user.emailVerified !== true) deny('Google email must be verified');
            return { data: user };
          },
        },
        update: {
          before: async (user) => {
            if (user.email && user.email.toLowerCase() !== config.allowedGoogleEmail) deny('Google account is not allowlisted');
            if (user.emailVerified === false) deny('Google email must remain verified');
            return { data: user };
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            if (account.providerId !== 'google') deny('Only Google sign-in is allowed');
            if (config.allowedGoogleSub && account.providerAccountId !== config.allowedGoogleSub) {
              deny('Google subject is not allowlisted');
            }
            return { data: account };
          },
        },
      },
    },
    plugins: [jwt(), mcpPlugin],
  });
}

export type Auth = ReturnType<typeof createAuth>;
