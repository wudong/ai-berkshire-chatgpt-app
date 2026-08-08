function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;color:#17202a}main{border:1px solid #d5d8dc;border-radius:12px;padding:2rem}button{font:inherit;padding:.7rem 1rem;border-radius:8px;border:1px solid #566573;background:#fff;cursor:pointer}button.primary{background:#17202a;color:#fff}code{word-break:break-all}p{line-height:1.5}.error{color:#922b21}</style></head><body><main>${body}</main></body></html>`;
}

const signedOAuthQueryScript = `
  function buildSignedOAuthQuery(search) {
    const params = new URLSearchParams(search);
    const signedParameterNames = new Set(params.getAll('ba_param'));
    if (!params.has('sig') || signedParameterNames.size === 0) return null;
    const signedParams = new URLSearchParams();
    for (const [key, value] of params.entries()) {
      if (key === 'sig' || key === 'ba_param' || signedParameterNames.has(key)) signedParams.append(key, value);
    }
    return signedParams.toString();
  }
  const oauth_query = buildSignedOAuthQuery(location.search);`;

export function signInPage(): string {
  return page('Sign in', `<h1>AI Berkshire MCP</h1><p>Sign in with the Google account authorised for this private investment research service.</p><button class="primary" id="sign-in">Continue with Google</button><p class="error" id="error" role="alert"></p><script>
${signedOAuthQueryScript}
  document.getElementById('sign-in').addEventListener('click', async () => {
    const button = document.getElementById('sign-in'); button.disabled = true;
    try {
      const response = await fetch('/api/auth/sign-in/social', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({provider:'google',oauth_query})});
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.message || 'Unable to start Google sign-in');
      location.assign(data.url);
    } catch (error) { document.getElementById('error').textContent = error instanceof Error ? error.message : 'Sign-in failed'; button.disabled = false; }
  });
</script>`);
}

export function consentPage(clientId: string, scopes: string): string {
  const safeClient = clientId.replace(/[&<>"']/g, '');
  const safeScopes = scopes.replace(/[&<>"']/g, '');
  return page('Authorise access', `<h1>Authorise AI Berkshire access</h1><p>Client: <code>${safeClient}</code></p><p>Requested scopes: <code>${safeScopes}</code></p><p>This grants access to the configured investment research, portfolio, thesis, and deterministic financial-rigor tools. It does not grant brokerage or trade-execution access.</p><button class="primary" id="allow">Allow</button> <button id="deny">Deny</button><p class="error" id="error" role="alert"></p><script>
${signedOAuthQueryScript}
  async function submit(accept) {
    const response = await fetch('/api/auth/oauth2/consent', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({accept,oauth_query})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Consent failed');
    if (data.url) location.assign(data.url); else location.reload();
  }
  document.getElementById('allow').addEventListener('click', () => submit(true).catch(e => document.getElementById('error').textContent=e.message));
  document.getElementById('deny').addEventListener('click', () => submit(false).catch(e => document.getElementById('error').textContent=e.message));
</script>`);
}
