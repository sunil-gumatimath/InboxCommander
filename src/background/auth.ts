/**
 * background/auth.ts
 * Mock Gmail OAuth2 module to bypass authentication for development/offline testing.
 */

export function getAuthToken(interactive: boolean = false): Promise<string> {
  return Promise.resolve('mock-oauth-token-12345');
}

export const getAuthTokenSilent = (): Promise<string> => Promise.resolve('mock-oauth-token-12345');
export const getAuthTokenInteractive = (): Promise<string> => Promise.resolve('mock-oauth-token-12345');

export function removeAuthToken(token: string): Promise<void> {
  return Promise.resolve();
}

/**
 * Bypasses auth check and always returns true.
 */
export async function isAuthenticated(): Promise<boolean> {
  return true;
}

export async function revokeAuth(): Promise<void> {
  return Promise.resolve();
}

/**
 * Returns a fake Response object.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return new Response(JSON.stringify({ mock: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
