# MailFlow Agent

Chrome extension (MV3) that reads, summarizes, classifies, drafts, replies to, and labels Gmail with Gemini.

## Load locally

1. `chrome://extensions` → Developer mode → **Load unpacked**
2. Select this folder
3. Open the extension's **Options** page and paste your Gemini API key
4. Open Gmail, click the toolbar icon → **Open side panel**

## Configure

- `manifest.json` → set `oauth2.client_id` to your Google OAuth client ID
- Options page → set Gemini API key
