import { parsePR } from './shared/workflow';

const globalFlag = globalThis as typeof globalThis & { __chatflowGitHubInstalled?: boolean };
if (!globalFlag.__chatflowGitHubInstalled) {
  globalFlag.__chatflowGitHubInstalled = true;
  const initial = parsePR(location.href);
  if (initial) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '↗ Review in ChatFlow';
    button.setAttribute('aria-label', 'Review pull request ' + initial.number + ' in ChatFlow');
    Object.assign(button.style, {
      position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483645',
      background: '#202f4d', color: '#fff', padding: '10px 16px',
      borderRadius: '999px', border: '1px solid #5f759a',
      boxShadow: '0 5px 24px #0002', cursor: 'pointer', font: '600 12px system-ui',
    });
    button.addEventListener('click', async () => {
      const pr = parsePR(location.href);
      if (!pr) return;
      const response = await chrome.runtime.sendMessage({ type: 'START_REVIEW', prUrl: pr.url }) as { ok: boolean; error?: string };
      if (!response?.ok) {
        button.textContent = response?.error ?? 'Unable to open review';
        setTimeout(() => { button.textContent = '↗ Review in ChatFlow'; }, 3000);
      }
    });
    document.body.append(button);
  }
}
