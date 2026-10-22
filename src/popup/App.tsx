import { useEffect, useMemo } from 'react';
import {
  chatIdentity, isChatGPT, lookupByChatUrl, parsePR, reviewPrompt, type ChatContext, type WorkflowState,
} from '../shared/workflow';
import { setActiveTab, setBusy, setNotice, setPR, setWorkflows, useAppDispatch, useAppSelector } from './store';

interface Reply { ok: boolean; error?: string; state?: WorkflowState; context?: ChatContext | null }

async function request(message: Record<string, unknown>): Promise<Reply> {
  return await chrome.runtime.sendMessage(message) as Reply;
}

function formatDate(value?: string): string {
  if (!value) return '';
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '' : time.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function App() {
  const dispatch = useAppDispatch();
  const { prInput, sourceLabel, activeTabId, activeTabUrl, workflows, busy, notice } = useAppSelector(state => state.popup);
  const selected = useMemo(() => parsePR(prInput), [prInput]);
  const workflow = selected ? workflows[selected.url] : null;
  const match = useMemo(() => lookupByChatUrl(workflows, activeTabUrl), [workflows, activeTabUrl]);
  const onReviewChat = !!(match?.mode === 'review' && match.workflow.prUrl === selected?.url);
  const recent = useMemo(() => Object.values(workflows)
    .filter(wf => parsePR(wf.prUrl))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .slice(0, 5), [workflows]);

  useEffect(() => {
    let live = true;
    const initialize = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!live) return;
      dispatch(setActiveTab({ id: tab?.id ?? null, url: tab?.url ?? null }));
      const stateResponse = await request({ type: 'GET_STATE' });
      if (!live) return;
      const saved = stateResponse.state?.workflows ?? {};
      dispatch(setWorkflows(saved));
      let candidate = parsePR(tab?.url);
      let source = candidate ? 'GitHub PR' : '';
      if (!candidate && isChatGPT(tab?.url)) {
        const found = lookupByChatUrl(saved, tab?.url);
        if (found) {
          candidate = parsePR(found.workflow.prUrl);
          source = found.mode === 'review' ? 'Review chat' : 'Dev chat';
        }
        if (!candidate && tab?.id != null) {
          try {
            const result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' }) as Reply;
            candidate = parsePR(result.context?.pr?.url);
            if (candidate) source = 'ChatGPT link';
          } catch { /* A tab may need reloading after installing the extension. */ }
        }
      }
      if (!candidate) {
        const last = Object.values(saved).filter(w => parsePR(w.prUrl))
          .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0];
        if (last) { candidate = parsePR(last.prUrl); source = 'Recent PR'; }
      }
      if (live && candidate) dispatch(setPR({ url: candidate.url, source }));
    };
    void initialize().catch(error => {
      if (live) dispatch(setNotice({ message: String(error), error: true }));
    });
    const onStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.chatflowStateV1) {
        const next = changes.chatflowStateV1.newValue as WorkflowState | undefined;
        dispatch(setWorkflows(next?.workflows ?? {}));
      }
    };
    chrome.storage.onChanged.addListener(onStorageChange);
    return () => { live = false; chrome.storage.onChanged.removeListener(onStorageChange); };
  }, [dispatch]);

  async function perform(message: Record<string, unknown>, shouldClose = true) {
    dispatch(setBusy(true));
    dispatch(setNotice(null));
    try {
      const response = await request(message);
      if (!response?.ok) throw new Error(response?.error ?? 'ChatFlow action failed.');
      if (shouldClose) window.close();
      else {
        const state = await request({ type: 'GET_STATE' });
        dispatch(setWorkflows(state.state?.workflows ?? {}));
        dispatch(setNotice({ message: 'Developer chat linked.', error: false }));
      }
    } catch (error) {
      dispatch(setNotice({ message: error instanceof Error ? error.message : String(error), error: true }));
    } finally {
      dispatch(setBusy(false));
    }
  }

  async function copyReview() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(reviewPrompt(selected));
      dispatch(setNotice({ message: 'Prompt copied. Select Code Reviewer in ChatGPT before sending.', error: false }));
    } catch {
      dispatch(setNotice({ message: 'Clipboard unavailable. Try again from the ChatGPT tab.', error: true }));
    }
  }

  return (
    <main className="app">
      <header className="header">
        <div className="brand-icon">↗</div>
        <div>
          <h1>ChatFlow <span>0.2</span></h1>
        </div>
        <span className="local-chip">LOCAL</span>
      </header>

      <section className="content">
        <div className="field-heading">
          <label htmlFor="pr-url">Pull request</label>
          <span>{sourceLabel}</span>
        </div>
        <input
          id="pr-url"
          type="url"
          placeholder="https://github.com/owner/repo/pull/123"
          spellCheck={false}
          value={prInput}
          onChange={event => dispatch(setPR({ url: event.target.value, source: 'Manual' }))}
        />
        <p className="hint">
          {selected ? selected.owner + '/' + selected.repo + ' · PR #' + selected.number + (onReviewChat ? ' · review chat' : '') :
            'Open a PR or a ChatGPT development chat to detect one.'}
        </p>

        <div className="primary-actions">
          <button className="primary" disabled={!selected || busy}
            onClick={() => selected && void perform({ type: 'START_REVIEW', prUrl: selected.url, sourceUrl: activeTabUrl })}>
            <span aria-hidden="true">↗</span> New review
          </button>
          <button className="secondary" disabled={!selected || !workflow?.reviewChatUrl || busy}
            onClick={() => selected && void perform({ type: 'PREPARE_REREVIEW', prUrl: selected.url })}>
            <span aria-hidden="true">↻</span> Re-review
          </button>
        </div>

        <div className="section-heading"><h2>Conversation links</h2><small>Saved automatically</small></div>
        <div className="link-stack">
          <button className="link-row" disabled={!workflow?.devChatUrl || busy}
            onClick={() => void perform({ type: 'OPEN_CHAT', url: workflow?.devChatUrl })}>
            <span className="dot dev" /> Developer chat <span className="arrow">↗</span>
          </button>
          <button className="link-row" disabled={!workflow?.reviewChatUrl || busy}
            onClick={() => void perform({ type: 'OPEN_CHAT', url: workflow?.reviewChatUrl })}>
            <span className="dot review" /> Review chat <span className="arrow">↗</span>
          </button>
          <button className="link-row fix" disabled={!workflow?.devChatUrl || busy}
            onClick={() => selected && void perform({ type: 'PREPARE_DEV_FIX', prUrl: selected.url })}>
            <span className="dot fix-dot" /> Prepare fixes in dev <span className="arrow">↗</span>
          </button>
          {selected && chatIdentity(activeTabUrl) && !onReviewChat && workflow?.devChatUrl !== chatIdentity(activeTabUrl) &&
            <button className="link-row manual" disabled={busy}
              onClick={() => void perform({ type: 'SET_DEV_CHAT', prUrl: selected.url, devChatUrl: activeTabUrl }, false)}>
              Link current tab as developer chat
            </button>}
        </div>

        {recent.length > 0 && <>
          <div className="section-heading recent-title"><h2>Recent PRs</h2><small>Click to switch</small></div>
          <div className="recent">
            {recent.map(wf => {
              const pr = parsePR(wf.prUrl);
              return pr && (
                <button key={wf.prUrl} className={'recent-item' + (pr.url === selected?.url ? ' active' : '')}
                  onClick={() => dispatch(setPR({ url: pr.url, source: 'Recent PR' }))}>
                  <span>{pr.label}</span><small>{formatDate(wf.updatedAt)}</small>
                </button>
              );
            })}
          </div>
        </>}

        <button className="copy" disabled={!selected || busy} onClick={() => void copyReview()}>
          <span>Copy review prompt</span><span>⧉</span>
        </button>
        {notice && <p role="status" className={'notice' + (notice.error ? ' error' : '')}>{notice.message}</p>}
      </section>
      <footer>Prompts are prepared, not sent. Select the Code Reviewer plugin before submitting.</footer>
    </main>
  );
}
