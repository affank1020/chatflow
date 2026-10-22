import {
  STORAGE_KEY, chatIdentity, devFixPrompt, lookupByChatUrl, parsePR,
  rereviewPrompt, reviewDeepLink,
  type PullRequest, type WorkflowState,
} from './shared/workflow';

const blankState = (): WorkflowState => ({ workflows: {}, pendingTabs: {} });

async function load(): Promise<WorkflowState> {
  const raw = (await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Partial<WorkflowState> | undefined;
  return { workflows: raw?.workflows ?? {}, pendingTabs: raw?.pendingTabs ?? {} };
}

// Serialize read-modify-write operations so simultaneous tab/storage events cannot erase links.
let mutations: Promise<unknown> = Promise.resolve();
function mutate(change: (state: WorkflowState) => void): Promise<WorkflowState> {
  const job = mutations.then(async () => {
    const state = await load();
    change(state);
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    return state;
  });
  mutations = job.catch(() => undefined);
  return job;
}

const now = (): string => new Date().toISOString();

async function startReview(rawUrl: unknown, sourceUrl?: unknown) {
  const pr = parsePR(rawUrl);
  if (!pr) throw new Error('Enter a valid GitHub pull request URL.');
  const source = chatIdentity(sourceUrl);
  await mutate(state => {
    const old = state.workflows[pr.url] ?? { prUrl: pr.url };
    const linked = lookupByChatUrl(state.workflows, source);
    const devChatUrl = source && linked?.mode !== 'review' ? source : old.devChatUrl ?? null;
    state.workflows[pr.url] = { ...old, prUrl: pr.url, devChatUrl, updatedAt: now() };
  });
  const tab = await chrome.tabs.create({ url: reviewDeepLink(pr), active: true });
  if (tab.id != null) {
    await mutate(state => { state.pendingTabs[String(tab.id)] = pr.url; });
  }
  return { pr, tabId: tab.id };
}

async function openChat(url: unknown) {
  const identity = chatIdentity(url);
  if (!identity) throw new Error('No linked ChatGPT conversation yet.');
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  const existing = tabs.find(tab => chatIdentity(tab.url) === identity);
  if (existing?.id != null) {
    if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    return { tabId: existing.id, reused: true };
  }
  const tab = await chrome.tabs.create({ url: identity, active: true });
  return { tabId: tab.id, reused: false };
}

async function insertPromptIntoTab(tabId: number, prompt: string) {
  let lastError = 'ChatGPT composer could not be reached.';
  for (let attempt = 0; attempt < 16; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'INSERT_PROMPT', prompt }) as
        { ok?: boolean; error?: string; notice?: string } | undefined;
      if (response?.ok) return { inserted: true, notice: response.notice };
      // Do not retry if ChatGPT already contains a user's draft.
      if (response?.error?.includes('draft')) throw new Error(response.error);
      lastError = response?.error ?? lastError;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('draft')) throw error;
      lastError = message;
    }
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error(lastError + ' The linked chat has been opened; you can paste the prompt manually.');
}

async function prepareLinked(rawUrl: unknown, kind: 'review' | 'dev') {
  const pr = parsePR(rawUrl);
  if (!pr) throw new Error('Invalid pull request URL.');
  const workflow = (await load()).workflows[pr.url];
  const target = kind === 'review' ? workflow?.reviewChatUrl : workflow?.devChatUrl;
  if (!target) throw new Error('No linked ' + (kind === 'review' ? 'review' : 'developer') + ' chat yet.');
  const opened = await openChat(target);
  if (opened.tabId == null) throw new Error('Could not open the linked chat.');
  const prompt = kind === 'review' ? rereviewPrompt(pr) : devFixPrompt(pr);
  return { ...opened, ...(await insertPromptIntoTab(opened.tabId, prompt)) };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'chatflow-review-pr',
    title: 'Review this PR with ChatFlow',
    contexts: ['link', 'page'],
    documentUrlPatterns: ['https://github.com/*', 'https://chatgpt.com/*'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'chatflow-review-pr') return;
  const pr = parsePR(info.linkUrl) ?? parsePR(info.pageUrl);
  if (pr) void startReview(pr.url, tab?.url).catch(console.warn);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const actual = chatIdentity(changeInfo.url ?? tab.url);
  if (!actual) return;
  void mutate(state => {
    const prUrl = state.pendingTabs[String(tabId)];
    if (!prUrl) return;
    const workflow = state.workflows[prUrl];
    if (workflow) {
      workflow.reviewChatUrl = actual;
      workflow.updatedAt = now();
    }
    delete state.pendingTabs[String(tabId)];
  }).catch(console.warn);
});

chrome.tabs.onRemoved.addListener(tabId => {
  void mutate(state => { delete state.pendingTabs[String(tabId)]; }).catch(console.warn);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return;
  const msg = message as Record<string, unknown>;
  const run = async () => {
    switch (msg.type) {
      case 'GET_STATE': return { state: await load() };
      case 'START_REVIEW': return startReview(msg.prUrl, msg.sourceUrl ?? sender.tab?.url);
      case 'OPEN_CHAT': return openChat(msg.url);
      case 'PREPARE_REREVIEW': return prepareLinked(msg.prUrl, 'review');
      case 'PREPARE_DEV_FIX': return prepareLinked(msg.prUrl, 'dev');
      case 'SET_DEV_CHAT': {
        const pr = parsePR(msg.prUrl);
        const identity = chatIdentity(msg.devChatUrl ?? sender.tab?.url);
        if (!pr || !identity) throw new Error('Open a ChatGPT conversation and select a valid PR.');
        await mutate(state => {
          const existing = state.workflows[pr.url] ?? { prUrl: pr.url };
          const linked = lookupByChatUrl(state.workflows, identity);
          if (linked?.mode === 'review') throw new Error('Cannot use a reviewer conversation as the developer chat.');
          state.workflows[pr.url] = { ...existing, prUrl: pr.url, devChatUrl: identity, updatedAt: now() };
        });
        return {};
      }
      default: throw new Error('Unknown ChatFlow operation.');
    }
  };
  void run().then(data => sendResponse({ ok: true, ...data })).catch(error => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  });
  return true;
});
