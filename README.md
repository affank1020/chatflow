# ChatFlow — PR review handoff helper (v0.1)

A small, *local-only*, unpacked Chrome extension. Designed for the Atlas + Benchmark workflow, but works with any GitHub PR.

## What already works

- Detect GitHub pull request URLs in the current GitHub page or ChatGPT conversation.
- Click **Review #N** in ChatGPT or **Review in ChatFlow** on a GitHub PR; opens a **new** ChatGPT chat with the PR review prompt prefilled.
- After starting the new chat and sending a message, ChatFlow records the generated ChatGPT conversation URL as the review chat.
- Remember the developer chat when the review is started from that chat.
- **Re-review** inserts the latest-commit review request into an **empty** composer of the current ChatGPT chat; never silently overwrites a draft or submits.
- **Back to dev** and **Open review chat** shortcuts; they reuse already-open tabs when possible.
- Toolbar popup has manual URL fallback, prompt copy fallback, and a link to associate the current dev chat.
- Right-click GitHub PR links or PR pages to choose **Review this PR with ChatFlow** (where supported).

## Important limitation: actual Code Reviewer plugin selection

`@Code Reviewer` in a URL-prefilled message is **plain text**, not necessarily a selected ChatGPT plugin. Before submitting, choose Code Reviewer from the ChatGPT @ mention menu or the Plugins picker. This MVP intentionally avoids unreliable hidden React state hacks or blind auto-send. This is the largest remaining step before full one-click reviews.

The `?q=` ChatGPT prefill is a convenience, not a documented stable API. If ChatGPT changes its routing, **Copy review prompt** is the fallback. Likewise, inline ChatGPT composer selectors may break after UI updates.

## Install on macOS

1. Save/extract this folder to `~/Documents/GitRepos/chatflow` (or any permanent folder).
2. Visit `chrome://extensions` in Chrome and enable **Developer mode**.
3. Choose **Load unpacked** and select the **chatflow** folder containing `manifest.json`.
4. Pin ChatFlow to the Chrome toolbar and refresh open ChatGPT/GitHub tabs.
5. Open a ChatGPT developer chat containing a GitHub PR link. You should see a floating **Review #N** shortcut; the popup also detects it.

No build step, npm install, account login, API key, local server, or backend is needed. If you edit source, use **Reload** on `chrome://extensions` and refresh ChatGPT.

## Developer checks

Requires Node.js 20+ for tests:

```sh
npm test
npm run check
```

## Architecture

- `manifest.json` — MV3 permissions and site-specific content scripts.
- `background.js` — Chrome tab, context menu, storage, and conversation-link coordination.
- `lib/workflow.mjs` — independently testable URL and prompt utilities.
- `content-chatgpt.js` — lightweight context button, PR link detection, safe re-review draft insertion.
- `content-github.js` — GitHub PR action button.
- `popup.html/css/js` — toolbar UI.
- `tests/` — pure module tests.

Everything is stored only in Chrome's `storage.local`: canonical PR URLs and matching ChatGPT conversation URLs. No external extension backend and no GitHub token. The browser naturally loads the pages you explicitly open.

## Deliberately left out of v0.1

- Guaranteed activation of the Code Reviewer plugin / automatic message sending.
- Automatically identifying the most relevant PR in a long multi-PR conversation.
- Synchronising state across browsers/devices.
- Automatic PR-comment ingestion, completion notifications or continuous background monitoring.
- Backend, account system, repository and PR dashboards.

## Next iteration ideas

Prioritize reliable Code Reviewer activation, contextual detection of newly posted PRs without scanning whole chats, and capturing a reviewer verdict that can be shown with low-noise badges (no manual tagging). Consider a React + TypeScript/Vite popup after interaction patterns stabilize; for v0.1 the dependency-free structure makes loading and debugging faster.
