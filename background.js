import { parsePR, chatIdentity, reviewDeepLink, lookupByChatUrl } from './lib/workflow.mjs';

const KEY = 'chatflowStateV1';

async function load() {
  const result = await chrome.storage.local.get(KEY);
  const obj = result[KEY] ?? {};
  return { workflows: obj.workflows ?? {}, pendingTabs: obj.pendingTabs ?? {} };
}
async function save(state) { await chrome.storage.local.set({ [KEY]: state }); }
function now() { return new Date().toISOString(); }

async function startReview(rawUrl, sourceUrl) {
  const pr = parsePR(rawUrl);
  if (!pr) throw new Error('Enter a valid GitHub pull request URL.');
  const state = await load();
  const previous = state.workflows[pr.url] ?? {};
  const source = chatIdentity(sourceUrl);
  const matched = source ? lookupByChatUrl(state.workflows, source) : null;
  // Don't overwrite a known development link if the action originates in a review chat.
  const devChatUrl = source && matched?.mode !== 'review' ? source : previous.devChatUrl ?? null;
  state.workflows[pr.url] = {
    ...previous,
    prUrl: pr.url,
    devChatUrl: devChatUrl ?? previous.devChatUrl ?? null,
    reviewChatUrl: previous.reviewChatUrl ?? null,
    updatedAt: now(),
  };
  await save(state);
  const tab = await chrome.tabs.create({ url: reviewDeepLink(pr), active: true });
  // Pending link is resolved when ChatGPT navigates to its actual conversation URL.
  const fresh = await load();
  fresh.pendingTabs[String(tab.id)] = pr.url;
  await save(fresh);
  return { ok: true, pr, tabId: tab.id };
}

async function openChat(url) {
  const identity = chatIdentity(url);
  if (!identity) throw new Error('No linked ChatGPT conversation yet.');
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  const existing = tabs.find(t => chatIdentity(t.url) === identity);
  if (existing?.id != null) {
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    return { ok: true, tabId: existing.id, reused: true };
  }
  const tab = await chrome.tabs.create({ url: identity, active: true });
  return { ok: true, tabId: tab.id, reused: false };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'chatflow-review-pr',
    title: 'Review this PR with ChatFlow',
    contexts: ['link', 'page'],
    documentUrlPatterns: ['https://github.com/*', 'https://chatgpt.com/*'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'chatflow-review-pr') return;
  const link = parsePR(info.linkUrl ?? '') ?? parsePR(info.pageUrl ?? '');
  if (!link) return;
  try { await startReview(link.url, tab?.url); }
  catch (e) { console.warn('ChatFlow: failed to start review', e); }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const actual = chatIdentity(changeInfo.url ?? tab?.url);
  if (!actual) return;
  void (async () => {
    const state = await load();
    const pending = state.pendingTabs[String(tabId)];
    if (!pending || !state.workflows[pending]) return;
    state.workflows[pending].reviewChatUrl = actual;
    state.workflows[pending].updatedAt = now();
    delete state.pendingTabs[String(tabId)];
    await save(state);
  })().catch(e => console.warn('ChatFlow: chat binding failed', e));
});

chrome.tabs.onRemoved.addListener(tabId => {
  void (async () => {
    const state = await load();
    if (!state.pendingTabs[String(tabId)]) return;
    delete state.pendingTabs[String(tabId)];
    await save(state);
  })();
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;
  const run = async () => {
    switch (msg.type) {
      case 'START_REVIEW': return startReview(msg.prUrl, msg.sourceUrl ?? sender?.tab?.url);
      case 'OPEN_CHAT': return openChat(msg.url);
      case 'GET_STATE': return { ok: true, state: await load() };
      case 'SET_DEV_CHAT': {
        const pr = parsePR(msg.prUrl);
        const identity = chatIdentity(msg.devChatUrl ?? sender?.tab?.url);
        if (!pr || !identity) throw new Error('Open a ChatGPT conversation and enter a valid PR.');
        const state = await load();
        state.workflows[pr.url] = {
          ...(state.workflows[pr.url] ?? {}), prUrl: pr.url, devChatUrl: identity, updatedAt: now(),
        };
        await save(state);
        return { ok: true };
      }
      default: throw new Error('Unknown ChatFlow operation.');
    }
  };
  run().then(sendResponse).catch(e => sendResponse({ ok: false, error: e?.message ?? 'Unexpected error' }));
  return true;
});
