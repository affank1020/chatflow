(() => {
  if (globalThis.__chatflowGitHubInstalled) return;
  globalThis.__chatflowGitHubInstalled = true;
  const m = location.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)(?:\/|$)/);
  if (!m) return;
  const url = `https://github.com/${m[1]}/${m[2]}/pull/${Number(m[3])}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '↗ Review in ChatFlow';
  button.title = 'Create a new ChatGPT review chat with this PR prepared';
  button.setAttribute('aria-label', `Review pull request ${m[3]} in ChatFlow`);
  Object.assign(button.style, { position:'fixed',bottom:'24px',right:'24px',zIndex:'2147483645',background:'#202b42',color:'#fff',padding:'10px 16px',borderRadius:'999px',border:'1px solid #62728c',cursor:'pointer',font:'600 12px system-ui',boxShadow:'0 5px 24px #0002' });
  button.addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ type: 'START_REVIEW', prUrl: url });
    if (!response?.ok) { button.textContent = response?.error ?? 'Unable to open review'; setTimeout(() => button.textContent = '↗ Review in ChatFlow', 3000); }
  });
  document.body.append(button);
})();
