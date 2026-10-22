/** Pure shared workflow helpers, free of Chrome/browser APIs. */
export function parsePR(input) {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let u;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com' || u.username || u.password || u.port) return null;
  const m = u.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)(?:\/.*)?$/);
  if (!m) return null;
  const number = Number(m[3]);
  if (!Number.isSafeInteger(number)) return null;
  return {
    owner: m[1], repo: m[2], number,
    url: `https://github.com/${m[1]}/${m[2]}/pull/${number}`,
    label: `${m[1]}/${m[2]} #${number}`,
  };
}

export function isChatGPT(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'chatgpt.com'; }
  catch { return false; }
}

export function chatIdentity(input) {
  if (!isChatGPT(input)) return null;
  const u = new URL(input);
  if (!/(?:^|\/)c\/[^/?#]+/.test(u.pathname)) return null;
  return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
}

export function reviewPrompt(pr) { return `Review PR ${pr.number} ${pr.url} @Code Reviewer`; }
export function rereviewPrompt(pr) {
  return `Re-review PR ${pr.number} ${pr.url} @Code Reviewer\n\nReview the latest commit. Verify previous findings are fixed, identify any remaining or new actionable issues, and publish the updated review on GitHub.`;
}
export function reviewDeepLink(pr) {
  return `https://chatgpt.com/?q=${encodeURIComponent(reviewPrompt(pr))}`;
}

/** Recognise ChatGPT conversation pages after the first prompt is submitted. */
export function conversationUrl(url) {
  return chatIdentity(url);
}

export function lookupByChatUrl(workflows, url) {
  const identity = chatIdentity(url);
  if (!identity) return null;
  for (const wf of Object.values(workflows ?? {})) {
    if (!wf || !wf.prUrl) continue;
    if (chatIdentity(wf.reviewChatUrl) === identity) return { workflow: wf, mode: 'review' };
    if (chatIdentity(wf.devChatUrl) === identity) return { workflow: wf, mode: 'dev' };
  }
  return null;
}
