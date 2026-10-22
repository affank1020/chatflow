# ChatFlow

A local-first Chrome extension that makes ChatGPT↔GitHub pull-request handoffs less manual. Built with **React 19, TypeScript, Redux Toolkit, Vite and esbuild**, targeting Chrome Manifest V3.

## Install / run (macOS or Linux)

Requirements: Node.js **20.19+ or 22.12+** and npm.

```bash
git clone https://github.com/affank1020/chatflow.git
cd chatflow
npm install
npm run check
```

Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the **dist/** directory (not the repository root). If you installed the earlier v0.1 extension from the repository root, remove that unpacked entry first, then load `dist/`. Keep the repository folder in a permanent location.

To make changes: edit `src/`, run `npm run build`, click **Reload** on the extension card, then refresh open ChatGPT/GitHub tabs. The background service worker is bundled as an ES module, while content scripts are self-contained classic scripts.

## Features

- Detect canonical GitHub PR URLs from GitHub PR pages or ChatGPT conversation links.
- **New review** opens a new ChatGPT conversation with the PR review prompt prepared.
- **Re-review** opens the linked reviewer conversation and inserts a latest-commit re-review prompt.
- **Prepare fixes in dev** opens the linked developer conversation and inserts an instruction to inspect current GitHub findings and fix actionable issues.
- Both draft insertion actions **refuse to overwrite existing drafts** and **never automatically send messages**.
- Navigate between linked developer and reviewer conversations, reusing open browser tabs.
- Review button on GitHub PR pages and context-sensitive actions inside ChatGPT.
- Recent PR list and manual URL fallback in the React popup.

## Important limitation

Writing `@Code Reviewer` in a pre-filled message does **not** guarantee that ChatGPT selects the actual Code Reviewer plugin. Choose it through ChatGPT's plugin/mention picker before submitting. ChatGPT's `?q=` URL prefill and composer DOM are unofficial UI integrations and can change; the popup also provides a **Copy review prompt** fallback. This version deliberately does not click buttons within ChatGPT or auto-submit.

## Architecture

| Area | Source | Responsibility |
| --- | --- | --- |
| Popup | `src/popup/*` | React UI, Redux Toolkit state and actions |
| Service worker | `src/background.ts` | Tabs, context menu, serialized storage writes, linked-chat draft prep |
| ChatGPT | `src/content-chatgpt.ts` | Detect PR context, contextual buttons, safe prompt insertion |
| GitHub | `src/content-github.ts` | PR-page shortcut |
| Shared | `src/shared/workflow.ts` | URL validation, prompts and workflow types |
| Tests | `tests/*` | Workflow unit tests |
| Build | `scripts/build.mjs` | Vite popup bundle; esbuild worker and isolated content scripts |

Local Chrome storage key `chatflowStateV1` is unchanged from v0.1, preserving existing PR → developer/reviewer chat associations when updating the same installed extension. If you remove the old extension and re-add `dist/`, Chrome may assign a different extension ID and its storage will not automatically transfer. Keep the old extension enabled until you have copied any important links, or re-link them from your chats.

No ChatGPT credentials, GitHub tokens, external services, telemetry, or backend are required. Permissions are limited to storage, tabs, context menus, ChatGPT and GitHub.

## Development

```bash
npm run typecheck
npm test
npm run build
# or all at once:
npm run check
```

The compiled extension is in `dist/` and is not committed. GitHub Actions runs these checks on updates.

## Roadmap

1. Verify ChatGPT plugin selection flow in the live UI and reduce remaining manual selection where feasible.
2. Improve PR context detection in long, multi-PR chats without capturing message content.
3. Add lightweight per-PR status from GitHub, without creating a parallel task board.
4. Test optional cross-browser support once the Chrome workflow feels solid.
