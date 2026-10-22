export interface PullRequest {
  owner: string;
  repo: string;
  number: number;
  url: string;
  label: string;
}

export interface Workflow {
  prUrl: string;
  devChatUrl?: string | null;
  reviewChatUrl?: string | null;
  updatedAt?: string;
}

export interface WorkflowState {
  workflows: Record<string, Workflow>;
  pendingTabs: Record<string, string>;
}

export type ChatMode = 'dev' | 'review';
export interface ChatContext {
  pr: PullRequest;
  mode: ChatMode;
  wf: Workflow | null;
}

export const STORAGE_KEY = 'chatflowStateV1';

export function parsePR(input: unknown): PullRequest | null {
  if (typeof input !== 'string' || input.length > 2048) return null;
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname.toLowerCase() !== 'github.com'
      || u.username || u.password || u.port) return null;
  const match = u.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)(?:\/.*)?$/);
  if (!match) return null;
  const number = Number(match[3]);
  if (!Number.isSafeInteger(number)) return null;
  const owner = match[1];
  const repo = match[2];
  return { owner, repo, number, url: 'https://github.com/' + owner + '/' + repo + '/pull/' + number, label: owner + '/' + repo + ' #' + number };
}

export function isChatGPT(input: unknown): boolean {
  try {
    const u = new URL(String(input));
    return u.protocol === 'https:' && u.hostname === 'chatgpt.com' && !u.username && !u.password && !u.port;
  } catch { return false; }
}

export function chatIdentity(input: unknown): string | null {
  if (typeof input !== 'string' || !isChatGPT(input)) return null;
  const u = new URL(input);
  if (!/(?:^|\/)c\/[^/?#]+/.test(u.pathname)) return null;
  return u.origin + u.pathname.replace(/\/$/, '');
}

export function reviewPrompt(pr: PullRequest): string {
  return 'Review PR ' + pr.number + ' ' + pr.url + ' @Code Reviewer';
}

export function rereviewPrompt(pr: PullRequest): string {
  return 'Re-review PR ' + pr.number + ' ' + pr.url +
    ' @Code Reviewer\n\nReview the latest commit. Verify previous findings are fixed, identify any remaining or new actionable issues, and publish the updated review on GitHub.';
}

export function devFixPrompt(pr: PullRequest): string {
  return 'Please address the latest actionable review findings on PR #' + pr.number + ' (' + pr.url +
    '). Read the current GitHub review comments and latest head commit, fix valid issues, run appropriate checks, and update the PR. Avoid unrelated changes.';
}

export function reviewDeepLink(pr: PullRequest): string {
  return 'https://chatgpt.com/?q=' + encodeURIComponent(reviewPrompt(pr));
}

export function lookupByChatUrl(workflows: Record<string, Workflow>, url: unknown): { workflow: Workflow; mode: ChatMode } | null {
  const current = chatIdentity(url);
  if (!current) return null;
  for (const workflow of Object.values(workflows ?? {})) {
    if (!workflow?.prUrl) continue;
    if (chatIdentity(workflow.reviewChatUrl) === current) return { workflow, mode: 'review' };
    if (chatIdentity(workflow.devChatUrl) === current) return { workflow, mode: 'dev' };
  }
  return null;
}
