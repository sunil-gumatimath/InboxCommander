/**
 * background/auth.ts
 * Gmail OAuth2 module using chrome.identity.
 * Uses the oauth2 client_id and scopes declared in manifest.json.
 */

/**
 * Acquire an OAuth2 access token via chrome.identity.
 * @param interactive  — if true, prompts the user to sign in when no cached token exists.
 */
export function getAuthToken(interactive: boolean = false): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Failed to obtain auth token'));
        return;
      }
      const resolved =
        typeof token === 'string'
          ? token
          : (token as chrome.identity.GetAuthTokenResult | undefined)?.token;
      if (!resolved) {
        reject(new Error('Failed to obtain auth token'));
        return;
      }
      resolve(resolved);
    });
  });
}

export const getAuthTokenSilent = (): Promise<string> => getAuthToken(false);
export const getAuthTokenInteractive = (): Promise<string> => getAuthToken(true);

/**
 * Remove a token from chrome.identity's cache (used after 401 responses).
 */
export function removeAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

/**
 * Check whether a token can be obtained silently (i.e. the user has signed in before).
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await getAuthTokenSilent();
    return !!token;
  } catch {
    return false;
  }
}

/**
 * Revoke the current OAuth token both locally and at Google's revoke endpoint.
 */
export async function revokeAuth(): Promise<void> {
  let token: string | null = null;
  try {
    token = await getAuthTokenSilent();
  } catch {
    return;
  }
  if (!token) return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    });
  } catch {
    // Network failure during revoke shouldn't block local cleanup.
  }
  await removeAuthToken(token);
}

/**
 * fetch() wrapper that injects the Authorization header and transparently
 * refreshes the token on a 401 response.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await getAuthTokenSilent();
  const buildInit = (t: string): RequestInit => ({
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${t}`,
    },
  });

  let response = await fetch(url, buildInit(token));
  if (response.status === 401) {
    await removeAuthToken(token);
    token = await getAuthTokenSilent();
    response = await fetch(url, buildInit(token));
  }
  return response;
}
