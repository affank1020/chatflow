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

## Local development — watch mode

Run this once in a terminal and leave it running while editing:

```bash
npm run watch
# npm run dev also works
```

The watcher **automatically rebuilds `dist/`** when you change React/TS/CSS sources, background and content scripts, or static files in `public/`. No need to rerun `npm run build` on every edit. Stable Vite output filenames avoid accumulating old hashed assets; it does not clear esbuild output while watching.

**Chrome does not automatically reload unpacked extensions.** After edits, click **Reload** on ChatFlow in `chrome://extensions`, then refresh any open ChatGPT/GitHub tabs affected by content-script changes. If you change `vite.config.ts` or build scripts, restart `npm run watch` (Ctrl+C, then run it again). Use `npm run build` for a clean one-off production build.

For a focused verification of live rebuild behaviour:

```bash
npm run watch:smoke
```

This creates an isolated temporary copy, tests Vite, esbuild and static asset watch updates, and cleans up afterwards.

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
| Build | `scripts/build.mjs` | One-shot Vite/esbuild build |
| Watch | `scripts/watch.mjs` | Live Vite/esbuild rebuilding and public asset mirroring |

Local Chrome storage key `chatflowStateV1` is unchanged from v0.1, preserving existing PR → developer/reviewer chat associations when updating the same installed extension. If you remove the old extension and re-add `dist/`, Chrome may assign a different extension ID and its storage will not automatically transfer. Keep the old extension enabled until you have copied any important links, or re-link them from your chats.

No ChatGPT credentials, GitHub tokens, external services, telemetry, or backend are required. Permissions are limited to storage, tabs, context menus, ChatGPT and GitHub.

## Development

```bash
npm run typecheck
npm test
npm run build
npm run watch:smoke
# or production checks together:
npm run check
```

The compiled extension is in `dist/` and is not committed. GitHub Actions validates production and live watch builds.

## Roadmap

1. Verify ChatGPT plugin selection flow in the live UI and reduce remaining manual selection where feasible.
2. Improve PR context detection in long, multi-PR chats without capturing message content.
3. Add lightweight per-PR status from GitHub, without creating a parallel task board.
4. Test optional cross-browser support once the Chrome workflow feels solid.
