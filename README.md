# Substack Notes Generator – Chrome Extension

Generate high‑quality Substack Notes from any post you are viewing, then open the official composer with your selected note prefilled.

## What this does

- Extracts clean content (title + paragraphs) from the current Substack post page
- Generates 10 concise, self‑contained note candidates (250–800 chars)
- De‑duplicates similar candidates to avoid repetition
- Lets you expand/collapse each candidate in the popup (See more / See less)
- Opens the Notes composer with your chosen text prefilled (works on both Substack Reader and custom domains)

## How it works

- The composer is invoked via the Reader feed with a query parameter:
  - Compose path: `/home`
  - Prefill parameter: `message`
  - We always open: `https://substack.com/home?action=compose&message=<encoded>`
- If the prefill parameter flow is interrupted (e.g., login), a fallback stores the text in `chrome.storage.local` and injects it after the page loads.

## Files

- `manifest.json` – Manifest v3, permissions and content script wiring
- `popup.html` / `popup.css` / `popup.js` – Popup UI, candidate generation, See more toggle, open‑composer logic
- `content.js` – Compose page fallback injector (reads `pendingNoteText` and fills the editor)

## Permissions

- `activeTab`, `scripting`, `storage`, `tabs`
- Host permissions:
  - `*://*.substack.com/*` (Substack Reader + subdomains)
  - `https://*/*`, `http://*/*` (custom publication domains)

## Installation (local)

1. In Chrome, open `chrome://extensions`
2. Enable Developer mode (top right)
3. Click “Load unpacked” and select this folder

## Usage

1. Navigate to any Substack post (Reader or a publication’s domain)
2. Click the extension icon → “Generate 10 Candidates”
3. Use “See more” to expand candidates without leaving the popup
4. Click “Edit in Notes” on the one you like – composer opens with text prefilled

## Quality rules enforced

- Self‑contained: notes make sense without reading the post
- Concise: 250–800 characters
- No URLs appended
- Sanitization: removes leading artifacts like `From "…":` and `Note:`
- Punctuation safety: ensures clean sentence endings
- De‑duplication: avoids repeated stems/leads

## Development

- Folder: this repo is the unpacked extension
- Hot‑reload: after edits, click the reload icon on the extension in `chrome://extensions`

### Rebuild shareable ZIP (optional)

```
cd /Users/davidpaykin/Documents
zip -r substack_notes_extension_fixed.zip substack_sparkle_notes_generator_chrome_ext/
```

## Roadmap / Ideas

- Optional length controls (short/medium/long)
- Language support
- Inline copy button per candidate

## Troubleshooting

- If “Edit in Notes” opens but text is missing: you may have been redirected to login; the fallback injector fills the text shortly after load. If not, retry the action from the popup.
- If extension can’t open the composer, verify that `https://substack.com` is reachable and that host permissions are enabled.
