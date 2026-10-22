import {
  STORAGE_KEY, chatIdentity, lookupByChatUrl, parsePR,
  rereviewPrompt, type ChatContext, type Workflow, type WorkflowState,
} from './shared/workflow';

const globalFlag = globalThis as typeof globalThis & { __chatflowChatInstalled?: boolean };
if (!globalFlag.__chatflowChatInstalled) {
  globalFlag.__chatflowChatInstalled = true;

  let workflows: Record<string, Workflow> = {};
  let context: ChatContext | null = null;
  let scanTimeout: ReturnType<typeof setTimeout> | undefined;
  const container = document.createElement('div');
  container.id = 'chatflow-actions';
  Object.assign(container.style, {
    position: 'fixed', right: '24px', bottom: '112px', display: 'flex',
    gap: '8px', zIndex: '2147483645', font: '600 12px system-ui',
  });
  document.body.append(container);

  function detect(): ChatContext | null {
    const current = chatIdentity(location.href);
    const matching = lookupByChatUrl(workflows, current);
    if (matching?.mode === 'review') {
      const pr = parsePR(matching.workflow.prUrl);
      if (pr) return { pr, mode: 'review', wf: matching.workflow };
    }

    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="github.com/"][href*="/pull/"]');
    for (let i = links.length - 1; i >= 0; i--) {
      const pr = parsePR(links[i].href);
      if (pr) return { pr, mode: 'dev', wf: workflows[pr.url] ?? null };
    }
    if (matching?.mode === 'dev') {
      const pr = parsePR(matching.workflow.prUrl);
      if (pr) return { pr, mode: 'dev', wf: matching.workflow };
    }
    return null;
  }

  function showNotice(message: string) {
    let notice = document.getElementById('chatflow-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'chatflow-notice';
      Object.assign(notice.style, {
        position: 'fixed', right: '24px', bottom: '162px', zIndex: '2147483646',
        maxWidth: '350px', borderRadius: '10px', padding: '11px 14px',
        background: '#172741', color: '#fff', font: '12px system-ui',
        boxShadow: '0 8px 24px #0003',
      });
      document.body.append(notice);
    }
    notice.textContent = message;
    setTimeout(() => notice?.remove(), 6000);
  }

  function composer(): HTMLTextAreaElement | HTMLElement | null {
    const selectors = [
      '#prompt-textarea[contenteditable="true"]',
      '[data-lexical-editor="true"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea#prompt-textarea',
    ];
    for (const selector of selectors) {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.getClientRects().length) return el;
    }
    return null;
  }

  function insertPrompt(prompt: string): { ok: boolean; error?: string; notice?: string } {
    if (!prompt || prompt.length > 8000) return { ok: false, error: 'Invalid prompt.' };
    const editor = composer();
    if (!editor) return { ok: false, error: 'ChatGPT composer not found. Refresh this chat and try again.' };
    const existing = editor instanceof HTMLTextAreaElement ? editor.value : editor.innerText;
    if (existing?.trim()) return { ok: false, error: 'Composer already has a draft. Nothing was overwritten.' };
    editor.focus();
    if (editor instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(editor, prompt);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, prompt);
    }
    const result = editor instanceof HTMLTextAreaElement ? editor.value : editor.innerText;
    if (!result?.includes(prompt)) return { ok: false, error: 'Prompt insertion failed. Copy it using the ChatFlow popup.' };
    const notice = 'Prompt prepared. Select the actual @Code Reviewer plugin when applicable, then send.';
    showNotice(notice);
    return { ok: true, notice };
  }

  function button(label: string, handler: () => void | Promise<void>) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    Object.assign(el.style, {
      background: '#202f4d', color: '#fff', padding: '10px 14px',
      borderRadius: '999px', border: '1px solid #5f759a',
      boxShadow: '0 5px 24px #0002', cursor: 'pointer', font: '600 12px system-ui',
    });
    el.addEventListener('click', () => { void Promise.resolve(handler()).catch(error => showNotice(String(error))); });
    return el;
  }

  function render() {
    container.replaceChildren();
    if (!context) return;
    const { pr, mode } = context;
    if (mode === 'review') {
      container.append(button('↻ Re-review #' + pr.number, () => {
        const response = insertPrompt(rereviewPrompt(pr));
        if (!response.ok) showNotice(response.error ?? 'Could not prepare re-review.');
      }));
      if (context.wf?.devChatUrl) {
        container.append(button('↩ Fix in dev', async () => {
          const response = await chrome.runtime.sendMessage({ type: 'PREPARE_DEV_FIX', prUrl: pr.url }) as { ok: boolean; error?: string };
          if (!response?.ok) showNotice(response?.error ?? 'Could not open the developer chat.');
        }));
      }
    } else {
      container.append(button('↗ Review #' + pr.number, async () => {
        const response = await chrome.runtime.sendMessage({ type: 'START_REVIEW', prUrl: pr.url, sourceUrl: location.href }) as { ok: boolean; error?: string };
        if (!response?.ok) showNotice(response?.error ?? 'Could not start review.');
      }));
    }
  }

  function scan() {
    scanTimeout = undefined;
    const next = detect();
    const before = JSON.stringify(context ? [context.pr.url, context.mode, !!context.wf?.devChatUrl] : null);
    const after = JSON.stringify(next ? [next.pr.url, next.mode, !!next.wf?.devChatUrl] : null);
    context = next;
    if (before !== after) render();
  }
  function schedule() {
    if (scanTimeout) return;
    scanTimeout = setTimeout(scan, 220);
  }

  void chrome.storage.local.get(STORAGE_KEY).then(value => {
    workflows = (value[STORAGE_KEY] as WorkflowState | undefined)?.workflows ?? {};
    schedule();
  });
  chrome.storage.onChanged.addListener(changes => {
    if (changes[STORAGE_KEY]) {
      workflows = (changes[STORAGE_KEY].newValue as WorkflowState | undefined)?.workflows ?? {};
      schedule();
    }
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    const msg = message as { type: string; prompt?: string };
    if (msg.type === 'GET_CONTEXT') { context = detect(); respond({ ok: true, context }); }
    if (msg.type === 'INSERT_PROMPT') respond(insertPrompt(msg.prompt ?? ''));
  });

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
