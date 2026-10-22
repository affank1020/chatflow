/* ChatFlow's optional contextual action. Only scans GitHub PR links, never message text. */
(() => {
  if (globalThis.__chatflowChatInstalled) return;
  globalThis.__chatflowChatInstalled = true;
  const RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)(?:[/?#]|$)/i;
  let workflows = {};
  let context = null;
  let scheduled = false;
  let button;

  function canonical(raw) {
    try {
      const url = new URL(raw);
      if (url.hostname !== 'github.com' || url.protocol !== 'https:') return null;
      const m = url.href.match(RE);
      return m ? { number: Number(m[3]), url: `https://github.com/${m[1]}/${m[2]}/pull/${Number(m[3])}` } : null;
    } catch { return null; }
  }
  function identity(raw) {
    try {
      const u = new URL(raw);
      if (u.hostname !== 'chatgpt.com' || !/(?:^|\/)c\/[^/?#]+/.test(u.pathname)) return null;
      return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
    } catch { return null; }
  }
  function detect() {
    const current = identity(location.href);
    for (const wf of Object.values(workflows)) {
      if (!wf?.prUrl) continue;
      if (current && identity(wf.reviewChatUrl) === current) return { pr: canonical(wf.prUrl), mode: 'review', wf };
    }
    const links = [...document.querySelectorAll('a[href*="github.com/"][href*="/pull/"]')];
    for (let i = links.length - 1; i >= 0; --i) {
      const pr = canonical(links[i].href);
      if (pr) return { pr, mode: 'dev', wf: workflows[pr.url] ?? null };
    }
    for (const wf of Object.values(workflows)) {
      if (current && identity(wf.devChatUrl) === current) return { pr: canonical(wf.prUrl), mode: 'dev', wf };
    }
    return null;
  }
  function prompt(pr, review) {
    if (!review) return `Review PR ${pr.number} ${pr.url} @Code Reviewer`;
    return `Re-review PR ${pr.number} ${pr.url} @Code Reviewer\n\nReview the latest commit. Verify previous findings are fixed, identify any remaining or new actionable issues, and publish the updated review on GitHub.`;
  }
  function getEditor() {
    const candidates = [
      '#prompt-textarea[contenteditable="true"]',
      '[data-lexical-editor="true"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea#prompt-textarea',
    ];
    return candidates.map(s => document.querySelector(s)).find(el => el && el.getClientRects().length) ?? null;
  }
  function insertIntoComposer(text) {
    const el = getEditor();
    if (!el) return { ok: false, error: 'ChatGPT composer not found. Copy the prompt from the popup instead.' };
    if ((el.value ?? el.innerText ?? '').trim()) return { ok: false, error: 'Composer already has a draft. Copy the prompt instead of overwriting it.' };
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // insertText generates real editing events that rich-text editors generally handle.
      document.execCommand('insertText', false, text);
    }
    const actual = el.value ?? el.innerText ?? '';
    if (!actual.includes(text)) return { ok: false, error: 'ChatGPT rejected the draft insertion. Copy the prompt from the popup.' };
    return { ok: true, notice: 'Prompt inserted. Select the actual @Code Reviewer plugin before sending.' };
  }
  function showNotice(message) {
    let n = document.getElementById('chatflow-notice');
    if (!n) {
      n = document.createElement('div');
      n.id = 'chatflow-notice';
      Object.assign(n.style, { position:'fixed',bottom:'170px',right:'24px',zIndex:'2147483646',padding:'10px 14px',borderRadius:'10px',background:'#202b42',color:'#fff',font:'12px system-ui',maxWidth:'300px',boxShadow:'0 8px 30px #0003' });
      document.body.append(n);
    }
    n.textContent = message;
    setTimeout(() => n?.remove(), 4500);
  }
  function updateButton() {
    if (!button) {
      button = document.createElement('button');
      button.id = 'chatflow-review-quick-action';
      button.type = 'button';
      Object.assign(button.style, { position:'fixed',bottom:'115px',right:'25px',zIndex:'2147483645',background:'#202b42',color:'#fff',padding:'9px 14px',borderRadius:'999px',border:'1px solid #62728c',cursor:'pointer',font:'600 12px system-ui',boxShadow:'0 5px 24px #0002' });
      button.addEventListener('click', async () => {
        if (!context?.pr) return;
        if (context.mode === 'review') {
          const result = insertIntoComposer(prompt(context.pr, true));
          showNotice(result.ok ? result.notice : result.error);
        } else {
          const response = await chrome.runtime.sendMessage({ type: 'START_REVIEW', prUrl: context.pr.url, sourceUrl: location.href });
          if (!response?.ok) showNotice(response?.error ?? 'Could not open review chat.');
        }
      });
      document.body.append(button);
    }
    if (!context?.pr) { if (!button.hidden) button.hidden = true; return; }
    if (button.hidden) button.hidden = false;
    const label = context.mode === 'review' ? `↻ Re-review #${context.pr.number}` : `↗ Review #${context.pr.number}`;
    if (button.textContent !== label) button.textContent = label;
  }
  function scan() {
    scheduled = false;
    context = detect();
    updateButton();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 200);
  }
  chrome.storage.local.get('chatflowStateV1').then(r => { workflows = r.chatflowStateV1?.workflows ?? {}; schedule(); });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.chatflowStateV1) {
      workflows = changes.chatflowStateV1.newValue?.workflows ?? {};
      schedule();
    }
  });
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.type === 'GET_CONTEXT') { context = detect(); respond({ ok: true, context }); }
    if (msg?.type === 'INSERT_PROMPT') { respond(insertIntoComposer(msg.prompt)); }
  });
  // ChatGPT uses client-side routing and rerenders its messages.
  const obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
})();
