import { describe, expect, it } from 'vitest';
import { parsePR, chatIdentity, reviewPrompt, rereviewPrompt, devFixPrompt, reviewDeepLink, lookupByChatUrl } from '../src/shared/workflow';

describe('PR URL validation', () => {
  it('canonicalizes GitHub PR URLs', () => {
    expect(parsePR('https://github.com/affank1020/atlas/pull/65?utm_source=chatgpt.com')).toEqual({
      owner:'affank1020',repo:'atlas',number:65,url:'https://github.com/affank1020/atlas/pull/65',label:'affank1020/atlas #65'
    });
    expect(parsePR('https://github.com/affank1020/benchmark/pull/6/files')?.number).toBe(6);
  });
  it('rejects spoofed hosts and invalid numbers', () => {
    for (const url of ['https://github.com.evil.test/a/b/pull/3', 'http://github.com/a/b/pull/3',
      'https://github.com/a/b/issues/2', 'https://github.com/a/b/pull/0',
      'https://github.com/a/b/pull/99999999999999999999999', 'https://user:password@github.com/a/b/pull/1']) {
      expect(parsePR(url)).toBeNull();
    }
  });
});

describe('workflow prompts', () => {
  const pr = parsePR('https://github.com/affank1020/atlas/pull/64')!;
  it('prepares the review deep link', () => {
    expect(reviewPrompt(pr)).toContain('Review PR 64');
    expect(new URL(reviewDeepLink(pr)).searchParams.get('q')).toBe(reviewPrompt(pr));
  });
  it('prepares useful follow-up prompts', () => {
    expect(rereviewPrompt(pr)).toContain('latest commit');
    expect(devFixPrompt(pr)).toContain('GitHub review comments');
  });
});

describe('chat association', () => {
  const wf = {prUrl:'https://github.com/a/b/pull/1',devChatUrl:'https://chatgpt.com/c/development',reviewChatUrl:'https://chatgpt.com/c/review'};
  it('matches conversation URLs and preserves chat roles', () => {
    expect(chatIdentity('https://chatgpt.com/c/development?x=y')).toBe('https://chatgpt.com/c/development');
    expect(lookupByChatUrl({[wf.prUrl]:wf},'https://chatgpt.com/c/review')?.mode).toBe('review');
    expect(lookupByChatUrl({[wf.prUrl]:wf},'https://chatgpt.com/c/development')?.mode).toBe('dev');
    expect(lookupByChatUrl({[wf.prUrl]:wf},'https://chatgpt.com/')).toBeNull();
  });
});
