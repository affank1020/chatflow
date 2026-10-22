import { parsePR, chatIdentity, lookupByChatUrl, reviewPrompt, rereviewPrompt, isChatGPT } from './lib/workflow.mjs';

const $ = id => document.getElementById(id);
let tab = null;
let workflows = {};
let selected = null;
let currentMatch = null;
let detected = null;

function status(message, error = false) {
  $('status').textContent = message;
  $('status').className = error ? 'status error' : 'status';
}
function linked() { return selected ? workflows[selected.url] ?? null : null; }
function rerender() {
  selected = parsePR($('pr-url').value);
  const wf = linked();
  currentMatch = lookupByChatUrl(workflows, tab?.url);
  const isReview = !!(currentMatch?.mode === 'review' && currentMatch?.workflow?.prUrl === selected?.url);
  $('review').disabled = !selected;
  $('rereview').disabled = !selected || !isReview;
  $('dev').disabled = !wf?.devChatUrl;
  $('review-chat').disabled = !wf?.reviewChatUrl;
  $('link-dev').disabled = !selected || !chatIdentity(tab?.url) || isReview;
  $('copy').disabled = !selected;
  $('pr-caption').textContent = selected
    ? `${selected.owner}/${selected.repo}  ·  PR #${selected.number}${isReview ? '  ·  review chat' : ''}`
    : 'Paste a GitHub PR URL, or open a PR / development chat.';
}
async function refresh() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  workflows = response?.state?.workflows ?? {};
  rerender();
}
function getRecent() {
  return Object.values(workflows).filter(w => parsePR(w?.prUrl)).sort((a,b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0] ?? null;
}
async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  workflows = response?.state?.workflows ?? {};
  let candidate = parsePR(tab?.url);
  let source = candidate ? 'GitHub PR' : '';
  if (!candidate && isChatGPT(tab?.url)) {
    const match = lookupByChatUrl(workflows, tab?.url);
    if (match) { candidate = parsePR(match.workflow.prUrl); source = match.mode === 'review' ? 'Review chat' : 'Dev chat'; }
    try {
      const r = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' });
      if (!candidate && r?.context?.pr) { candidate = parsePR(r.context.pr.url); source = 'ChatGPT link'; }
    } catch { /* ChatGPT page may need refresh after initial extension install. */ }
  }
  if (!candidate) {
    const recent = getRecent();
    if (recent) { candidate = parsePR(recent.prUrl); source = 'Recent PR'; }
  }
  if (candidate) { $('pr-url').value = candidate.url; $('source-label').textContent = source; }
  detected = candidate;
  rerender();
}

$('pr-url').addEventListener('input', () => {
  $('source-label').textContent = 'Manual';
  status('');
  rerender();
});
$('review').addEventListener('click', async () => {
  if (!selected) return;
  const response = await chrome.runtime.sendMessage({type:'START_REVIEW',prUrl:selected.url,sourceUrl:tab?.url});
  if (!response?.ok) { status(response?.error ?? 'Failed to open ChatGPT.', true); return; }
  status('Review chat opened. Select @Code Reviewer before sending.');
  window.close();
});
$('rereview').addEventListener('click', async () => {
  if (!selected || !tab?.id) return;
  const text = rereviewPrompt(selected);
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type:'INSERT_PROMPT',prompt:text });
    if (!response?.ok) {
      await navigator.clipboard.writeText(text);
      status('Copied instead — paste into ChatGPT (existing draft was kept).');
    } else {
      status(response.notice ?? 'Prompt inserted.');
      window.close();
    }
  } catch {
    try { await navigator.clipboard.writeText(text); status('Copied re-review prompt. Paste into ChatGPT.'); }
    catch { status('Refresh the ChatGPT tab, then try again.', true); }
  }
});
$('dev').addEventListener('click', async () => {
  const wf = linked(); if (!wf?.devChatUrl) return;
  const response = await chrome.runtime.sendMessage({type:'OPEN_CHAT',url:wf.devChatUrl});
  if (!response?.ok) status(response?.error ?? 'Could not open dev chat', true);
  else window.close();
});
$('review-chat').addEventListener('click', async () => {
  const wf = linked(); if (!wf?.reviewChatUrl) return;
  const response = await chrome.runtime.sendMessage({type:'OPEN_CHAT',url:wf.reviewChatUrl});
  if (!response?.ok) status(response?.error ?? 'Could not open review chat', true);
  else window.close();
});
$('link-dev').addEventListener('click', async () => {
  if (!selected) return;
  const response = await chrome.runtime.sendMessage({ type:'SET_DEV_CHAT',prUrl:selected.url,devChatUrl:tab?.url });
  if (!response?.ok) status(response?.error ?? 'Could not associate dev chat', true);
  else { await refresh(); status('Developer chat linked.'); }
});
$('copy').addEventListener('click', async () => {
  if (!selected) return;
  try { await navigator.clipboard.writeText(reviewPrompt(selected)); status('Review prompt copied. Select the plugin in ChatGPT before sending.'); }
  catch { status('Clipboard unavailable; select and copy the PR URL instead.', true); }
});
init().catch(e => status(`ChatFlow could not initialise: ${e.message}`, true));
