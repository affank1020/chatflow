import {
  STORAGE_KEY, chatIdentity, lookupByChatUrl, parsePR, rereviewPrompt,
  type ChatContext, type PullRequest, type Workflow, type WorkflowState,
} from './shared/workflow';
import { positionLauncher, type Rect } from './shared/launcher';

const globalFlag = globalThis as typeof globalThis & { __chatflowChatInstalled?: boolean };
if (!globalFlag.__chatflowChatInstalled) {
  globalFlag.__chatflowChatInstalled = true;

  // Like EcoPrompt's Optimise launcher, anchor to the composer FORM, not a
  // particular ChatGPT toolbar. Shadow DOM prevents site styles from leaking.
  const host = document.createElement('div');
  host.id = 'chatflow-composer-mount';
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;z-index:2147483000;display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const styles = document.createElement('style');
  styles.textContent = `
    :host { color-scheme:dark; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    *, *::before, *::after { box-sizing:border-box; }
    button, input { font:inherit; }
    button { cursor:pointer; }
    button:disabled { opacity:.42;cursor:not-allowed; }
    button:focus-visible, input:focus-visible { outline:2px solid #85b5ff;outline-offset:2px; }
    .launcher { display:flex;align-items:center;gap:7px;min-height:32px;padding:6px 12px;
      border-radius:999px;border:1px solid #48526b;background:#202938;color:#e9f0ff;
      white-space:nowrap;font-size:12px;font-weight:650;box-shadow:0 3px 12px #0006; }
    .launcher:hover,.launcher[aria-expanded="true"] { border-color:#7298d3;background:#293750; }
    .launcher svg { width:15px;height:15px;stroke:#8cb9ff; }
    .launcher .chevron { font-size:10px;color:#91a5c3; }
    .panel { position:absolute;bottom:calc(100% + 10px);left:0;width:min(316px,calc(100vw - 24px));
      background:#181e29;border:1px solid #384459;border-radius:15px;padding:14px;
      color:#e9eef7;box-shadow:0 16px 45px #0009;font-size:12px; }
    .panel[hidden] { display:none; }
    .panel h2 { margin:0 0 3px;font-size:14px;font-weight:750;letter-spacing:-.2px; }
    .panel p { margin:0;color:#97a7bf;line-height:1.4;font-size:11px; }
    .panel .meta { padding-top:4px;overflow-wrap:anywhere;color:#afc2df; }
    .panel .actions { display:flex;flex-direction:column;gap:7px;margin-top:12px; }
    .action { display:flex;align-items:center;justify-content:space-between;width:100%;
      min-height:36px;padding:9px 11px;border:1px solid #39465d;border-radius:9px;
      background:#242d3d;color:#e7edf9;text-align:left;font-size:12px;font-weight:600; }
    .action:hover:not(:disabled) { background:#303e55;border-color:#61789a; }
    .action.primary { background:#3467c7;border-color:#4478d5;color:#fff; }
    .action.primary:hover:not(:disabled) { background:#467ada; }
    .action small { color:#a3b4cf;font-size:10px; }
    .action.primary small { color:#e9f1ff; }
    .manual { margin-top:13px; }
    .manual label { display:block;margin-bottom:6px;color:#c2cde0;font-size:11px;font-weight:600; }
    .manual input { display:block;width:100%;border:1px solid #46516a;border-radius:8px;
      padding:9px 10px;background:#111824;color:#edf3ff;outline:none;font-size:11px; }
    .manual input:focus { border-color:#85b5ff; }
    .help { margin-top:10px!important;font-size:10px!important; }
    .notice { margin-top:10px;padding:8px 9px;border-radius:8px;background:#283348;
      color:#cde0ff;line-height:1.45;font-size:11px;overflow-wrap:anywhere; }
  `;
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'launcher';
  launcher.title = 'ChatFlow PR review actions';
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h10v10M17 7 6 18"/><path d="M7 12V7h5"/></svg><span>ChatFlow</span><span class="chevron">▾</span>';
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.id = 'chatflow-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'ChatFlow review actions');
  panel.hidden = true;
  shadow.append(styles, launcher, panel);
  document.body.append(host);

  let workflows: Record<string, Workflow> = {};
  let context: ChatContext | null = null;
  let manualValue = '';
  let isOpen = false;
  let notice = '';
  let observedForm: Element | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshFrame: number | null = null;
  let lastUrl = location.href;
  const formObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;

  function findComposer(): HTMLElement | null {
    const selectors = [
      '#prompt-textarea',
      '[data-testid="prompt-textarea"]',
      'form [contenteditable][role="textbox"]',
      'form [contenteditable="true"]',
      'form [contenteditable="plaintext-only"]',
      'form textarea',
    ];
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(', ')))
      .filter(el => el.isConnected && !el.matches('[disabled], [contenteditable="false"]') &&
        !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
        el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    if (!candidates.length) return null;
    const focused = document.activeElement;
    const selected = focused && candidates.filter(el => el === focused || el.contains(focused));
    if (selected?.length) return selected[selected.length - 1];
    return candidates[candidates.length - 1];
  }

  function composerForm(composer: HTMLElement | null): Element | null {
    return composer?.closest('form') ??
      composer?.closest('[data-testid="composer"]') ??
      composer?.parentElement?.parentElement ?? null;
  }

  function parseContext(): ChatContext | null {
    const linked = lookupByChatUrl(workflows, location.href);
    if (linked?.mode === 'review') {
      const pr = parsePR(linked.workflow.prUrl);
      if (pr) return { pr, mode: 'review', wf: linked.workflow };
    }
    // Review chats can contain other PR links. The known chat association wins.
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="github.com/"][href*="/pull/"]');
    for (let i = links.length - 1; i >= 0; i--) {
      const pr = parsePR(links[i].href);
      if (pr) return { pr, mode: 'dev', wf: workflows[pr.url] ?? null };
    }
    if (linked) {
      const pr = parsePR(linked.workflow.prUrl);
      if (pr) return { pr, mode: linked.mode, wf: linked.workflow };
    }
    return null;
  }

  const selectedPR = (): PullRequest | null => manualValue.trim() ? parsePR(manualValue) : context?.pr ?? null;

  async function send(message: Record<string, unknown>): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage(message) as { ok?: boolean; error?: string };
      if (!response?.ok) throw new Error(response?.error ?? 'ChatFlow action failed.');
      notice = 'Action prepared. Check the opened ChatGPT tab.';
      renderPanel();
    } catch (error) {
      notice = error instanceof Error ? error.message : String(error);
      renderPanel();
    }
  }

  function insertPrompt(prompt: string): { ok: boolean; error?: string } {
    if (!prompt || prompt.length > 8000) return { ok: false, error: 'Invalid prompt.' };
    const editor = findComposer();
    if (!editor) return { ok: false, error: 'ChatGPT composer not found. Refresh this page.' };
    const existing = editor instanceof HTMLTextAreaElement ? editor.value : editor.innerText;
    if (existing?.trim()) return { ok: false, error: 'Composer already contains a draft. Nothing was overwritten.' };
    editor.focus();
    if (editor instanceof HTMLTextAreaElement) {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(editor, prompt);
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('insertText', false, prompt);
    }
    const actual = editor instanceof HTMLTextAreaElement ? editor.value : editor.innerText;
    if (!actual?.includes(prompt)) return { ok: false, error: 'Could not insert prompt. Copy it from the ChatFlow popup.' };
    return { ok: true };
  }

  function action(label: string, run: () => void | Promise<void>, options?: { primary?: boolean; disabled?: boolean }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action' + (options?.primary ? ' primary' : '');
    button.textContent = label;
    button.disabled = Boolean(options?.disabled);
    button.addEventListener('click', () => {
      void Promise.resolve().then(run).catch(error => {
        notice = String(error);
        renderPanel();
      });
    });
    return button;
  }

  function renderPanel() {
    panel.replaceChildren();
    if (!isOpen) return;

    const pr = selectedPR();
    const wf = pr ? workflows[pr.url] ?? (context?.pr.url === pr.url ? context.wf : null) : null;
    const isReview = !!(pr && context?.mode === 'review' && context.pr.url === pr.url);
    const heading = document.createElement('h2');
    heading.textContent = 'PR workflow';
    const description = document.createElement('p');
    description.textContent = pr ? pr.label : 'Start a review without switching away from ChatGPT.';
    description.className = 'meta';
    panel.append(heading, description);

    const buttons = document.createElement('div');
    buttons.className = 'actions';
    buttons.append(action('↗ New code review', () => {
      if (pr) return send({ type: 'START_REVIEW', prUrl: pr.url, sourceUrl: location.href });
    }, { primary: true, disabled: !pr }));

    if (isReview && pr) {
      buttons.append(action('↻ Re-review latest commit', () => {
        const result = insertPrompt(rereviewPrompt(pr));
        notice = result.ok ? 'Draft prepared. Select the Code Reviewer plugin before sending.' :
          result.error ?? 'Could not prepare re-review.';
        renderPanel();
      }));
    } else {
      buttons.append(action('↻ Re-review latest commit', () => {
        if (pr) return send({ type: 'PREPARE_REREVIEW', prUrl: pr.url });
      }, { disabled: !pr || !wf?.reviewChatUrl }));
    }
    buttons.append(action('↩ Prepare fixes in dev chat', () => {
      if (pr) return send({ type: 'PREPARE_DEV_FIX', prUrl: pr.url });
    }, { disabled: !pr || !wf?.devChatUrl }));

    if (pr && chatIdentity(location.href) && !isReview &&
      wf?.devChatUrl !== chatIdentity(location.href)) {
      buttons.append(action('＋ Link this as developer chat', () =>
        send({ type: 'SET_DEV_CHAT', prUrl: pr.url, devChatUrl: location.href })));
    }
    panel.append(buttons);

    const manual = document.createElement('div');
    manual.className = 'manual';
    const label = document.createElement('label');
    label.textContent = 'PR URL (optional)';
    label.htmlFor = 'chatflow-manual-pr';
    const input = document.createElement('input');
    input.id = 'chatflow-manual-pr';
    input.type = 'url';
    input.placeholder = 'https://github.com/owner/repo/pull/123';
    input.value = manualValue;
    input.addEventListener('input', () => {
      const caret = input.selectionStart;
      manualValue = input.value;
      // Rebuild action closures as well as disabled states when the PR changes.
      renderPanel();
      const refreshed = shadow.getElementById('chatflow-manual-pr') as HTMLInputElement | null;
      if (refreshed) {
        refreshed.focus();
        if (caret !== null) refreshed.setSelectionRange(caret, caret);
      }
    });
    manual.append(label, input);
    panel.append(manual);

    const help = document.createElement('p');
    help.className = 'help';
    help.textContent = 'ChatFlow prepares drafts; select Code Reviewer in ChatGPT and send manually.';
    panel.append(help);
    if (notice) {
      const element = document.createElement('div');
      element.className = 'notice';
      element.setAttribute('role', 'status');
      element.textContent = notice;
      panel.append(element);
    }
    schedule();
  }

  function refresh() {
    if (!host.isConnected) document.body.append(host);
    const form = composerForm(findComposer());
    if (form !== observedForm) {
      formObserver?.disconnect();
      observedForm = form;
      if (form) formObserver?.observe(form);
    }
    if (!form) {
      host.style.display = 'none';
      if (isOpen) { isOpen = false; panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); }
      return;
    }
    const rect = form.getBoundingClientRect();
    if (!rect.width || !rect.height) { host.style.display = 'none'; return; }

    const previous = context ? context.pr.url + ':' + context.mode + ':' +
      Boolean(context.wf?.devChatUrl) + ':' + Boolean(context.wf?.reviewChatUrl) : '';
    context = parseContext();
    const next = context ? context.pr.url + ':' + context.mode + ':' +
      Boolean(context.wf?.devChatUrl) + ':' + Boolean(context.wf?.reviewChatUrl) : '';
    if (previous !== next && isOpen) renderPanel();

    host.style.display = 'block';
    const eco = document.getElementById('ecoprompt-extension-mount');
    const ecoRect = eco?.getBoundingClientRect();
    const obstacles: Rect[] = ecoRect && ecoRect.width > 0 && ecoRect.height > 0 ? [ecoRect] : [];
    const launcherRect = launcher.getBoundingClientRect();
    const location = positionLauncher(rect, {
      width: launcherRect.width, height: launcherRect.height,
    }, { width: window.innerWidth, height: window.innerHeight }, obstacles);
    host.style.left = location.left + 'px';
    host.style.top = location.top + 'px';

    // Keep the panel in the viewport even on narrow/resized ChatGPT windows.
    const panelWidth = Math.min(316, window.innerWidth - 24);
    const panelLeft = Math.max(12, Math.min(window.innerWidth - panelWidth - 12,
      location.left + launcherRect.width - panelWidth));
    panel.style.left = Math.round(panelLeft - location.left) + 'px';
    if (isOpen) {
      const panelHeight = panel.getBoundingClientRect().height;
      const above = location.top - panelHeight - 10 >= 8;
      panel.style.top = above ? 'auto' : 'calc(100% + 10px)';
      panel.style.bottom = above ? 'calc(100% + 10px)' : 'auto';
    }
  }

  function schedule() {
    if (refreshTimer !== null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (refreshFrame !== null) return;
      refreshFrame = requestAnimationFrame(() => { refreshFrame = null; refresh(); });
    }, 100);
  }

  launcher.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.hidden = !isOpen;
    launcher.setAttribute('aria-expanded', String(isOpen));
    notice = '';
    renderPanel();
    schedule();
  });
  document.addEventListener('pointerdown', event => {
    if (isOpen && !event.composedPath().includes(host)) {
      isOpen = false;
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) {
      isOpen = false;
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      launcher.focus();
    }
  });

  void chrome.storage.local.get(STORAGE_KEY).then(result => {
    workflows = (result[STORAGE_KEY] as WorkflowState | undefined)?.workflows ?? {};
    schedule();
  }).catch(() => {});
  chrome.storage.onChanged.addListener(changes => {
    if (changes[STORAGE_KEY]) {
      workflows = (changes[STORAGE_KEY].newValue as WorkflowState | undefined)?.workflows ?? {};
      schedule();
    }
  });
  chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    const msg = message as { type: string; prompt?: string };
    if (msg.type === 'GET_CONTEXT') {
      context = parseContext();
      respond({ ok: true, context });
    }
    if (msg.type === 'INSERT_PROMPT') {
      const result = insertPrompt(msg.prompt ?? '');
      if (result.ok) {
        notice = 'Draft prepared. Select Code Reviewer if applicable, then send.';
        isOpen = true;
        panel.hidden = false;
        launcher.setAttribute('aria-expanded', 'true');
        renderPanel();
      }
      respond(result);
    }
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const onViewportChange = () => schedule();
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  document.addEventListener('focusin', schedule, true);
  const watchdog = setInterval(() => {
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      manualValue = '';
      if (isOpen) renderPanel();
    }
    schedule();
  }, 1500);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    clearInterval(watchdog);
    observer.disconnect();
    formObserver?.disconnect();
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
  });
  schedule();
}
