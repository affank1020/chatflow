import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePR, chatIdentity, reviewPrompt, rereviewPrompt, reviewDeepLink, lookupByChatUrl} from '../lib/workflow.mjs';
test('Canonicalizes GitHub PRs and strips tracking/query/anchors', () => {
  assert.deepEqual(parsePR('https://github.com/affank1020/atlas/pull/65?utm_source=chatgpt.com'), {
    owner:'affank1020',repo:'atlas',number:65,url:'https://github.com/affank1020/atlas/pull/65',label:'affank1020/atlas #65'
  });
  assert.equal(parsePR('https://github.com/affank1020/benchmark/pull/6/files')?.number,6);
});
test('Rejects bad PR hosts, protocols and paths', () => {
  for (const url of [
    'https://github.com.evil.test/a/b/pull/3', 'http://github.com/a/b/pull/3',
    'https://github.com/a/b/issues/2', 'https://github.com/a/b/pull/0',
    'https://github.com/a/b/pull/NaN', 'https://github.com/a/b/pull/99999999999999999999999',
    'https://person:password@github.com/a/b/pull/1', 'nonsense'
  ]) assert.equal(parsePR(url), null, url);
});
test('Review deep link includes PR and plugin hint', () => {
  const pr = parsePR('https://github.com/affank1020/atlas/pull/64');
  assert.match(reviewPrompt(pr), /Review PR 64/);
  assert.match(rereviewPrompt(pr), /latest commit/);
  const u = new URL(reviewDeepLink(pr));
  assert.equal(u.host,'chatgpt.com');
  assert.equal(u.searchParams.get('q'),reviewPrompt(pr));
});
test('Matches dev and reviewer chats using stable conversation path', () => {
  const wf = {prUrl:'https://github.com/a/b/pull/1', devChatUrl:'https://chatgpt.com/c/development',reviewChatUrl:'https://chatgpt.com/c/review'};
  const set={[wf.prUrl]:wf};
  assert.equal(chatIdentity('https://chatgpt.com/c/development?hello=true'),'https://chatgpt.com/c/development');
  assert.equal(lookupByChatUrl(set,'https://chatgpt.com/c/review?utm=whatever')?.mode,'review');
  assert.equal(lookupByChatUrl(set,'https://chatgpt.com/c/development')?.mode,'dev');
  assert.equal(lookupByChatUrl(set,'https://chatgpt.com/'),null);
});
