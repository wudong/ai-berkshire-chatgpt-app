export type AccessTokenClaims = {
  scope?: unknown;
};

export function hasRequiredScope(claims: AccessTokenClaims | undefined, requiredScope: string): boolean {
  if (!claims || typeof claims.scope !== 'string') return false;
  return claims.scope.split(/\s+/).filter(Boolean).includes(requiredScope);
}

export function insufficientScopeResponse(requiredScope: string, resourceUrl: string): Response {
  const resourceMetadata = new URL('/.well-known/oauth-protected-resource', resourceUrl).toString();
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'insufficient_scope' },
      id: null,
    }),
    {
      status: 403,
      headers: {
        'content-type': 'application/json',
        'www-authenticate': `Bearer error="insufficient_scope", scope="${requiredScope}", resource_metadata="${resourceMetadata}"`,
      },
    },
  );
}
