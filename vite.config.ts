import { defineConfig, loadEnv } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';

const PLACEHOLDER = '__GOOGLE_OAUTH_CLIENT_ID__';

function resolveClientId(env: Record<string, string>): string {
  const raw = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
  const isCiPlaceholder = raw === 'ci-placeholder.apps.googleusercontent.com';
  if (
    !raw ||
    raw === '' ||
    raw.includes('REPLACE') ||
    raw.includes('your_client_id') ||
    raw.includes('...') ||
    (isCiPlaceholder && !isGithubActions)
  ) {
    throw new Error(
      [
        '',
        '────────────────────────────────────────────────────────────',
        ' GOOGLE_OAUTH_CLIENT_ID is not set.',
        '',
        ' Create a Chrome-extension OAuth client at:',
        '   https://console.cloud.google.com/apis/credentials',
        '',
        ' Then either:',
        '   • Copy .env.example to .env and fill in the value, or',
        '   • Export it:  $env:GOOGLE_OAUTH_CLIENT_ID="...apps.googleusercontent.com"',
        '',
        ' The value must be your real Chrome-extension OAuth client ID,',
        ' not ci-placeholder or an example value.',
        '────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
  }
  if (!raw.endsWith('.apps.googleusercontent.com')) {
    throw new Error(
      `GOOGLE_OAUTH_CLIENT_ID looks invalid: "${raw}". Expected value to end with .apps.googleusercontent.com`,
    );
  }
  return raw.trim();
}

export default defineConfig(({ mode }) => {
  // Use 'GOOGLE_' prefix so loadEnv actually returns the var from .env files
  // (an empty-string prefix silently returns nothing in Vite ≥7).
  const env = loadEnv(mode, process.cwd(), 'GOOGLE_');
  const clientId = resolveClientId(env);

  const finalManifest = {
    ...manifest,
    oauth2: {
      ...(manifest.oauth2 ?? {}),
      client_id: clientId,
    },
  };

  return {
    root: 'src',
    build: {
      outDir: '..',
      emptyOutDir: false,
    },
    plugins: [crx({ manifest: finalManifest })],
  };
});
