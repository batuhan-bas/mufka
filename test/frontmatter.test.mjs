import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontmatterEnd } from '../lib/properties.mjs';
import { embedSection } from '../lib/embed.mjs';
import { collectTasks } from '../lib/tasks-query.mjs';
import { scanTags } from '../lib/tags.mjs';
import { isMeetingNote } from '../lib/meetings.mjs';
import { findMentions } from '../lib/noteinfo.mjs';

test('frontmatterEnd: the closing line, with --- or ..., CRLF or trailing spaces', () => {
  assert.equal(frontmatterEnd(['---', 'a: 1', '---', 'body']), 2);
  assert.equal(frontmatterEnd(['---', 'a: 1', '...', 'body']), 2);
  assert.equal(frontmatterEnd(['---\r', 'a: 1\r', '---\r', 'body']), 2);
  assert.equal(frontmatterEnd(['---  ', 'a: 1', '---  ']), 2);
  assert.equal(frontmatterEnd(['body', '---']), -1);
  assert.equal(frontmatterEnd(['---', 'a: 1']), -1);
  assert.equal(frontmatterEnd([]), -1);
});

test('an embed of a whole note leaves out CRLF frontmatter', () => {
  assert.equal(embedSection('---\r\ntags: [x]\r\n---\r\nHello', null), 'Hello');
});

test('tasks in a CRLF frontmatter are not tasks', () => {
  const tasks = collectTasks([{ rel: 'A.md', content: '---\r\n- [ ] not a task\r\n---\r\n- [ ] real\r\n' }]);
  assert.deepEqual(tasks.map((t) => t.description), ['real']);
});

test('frontmatter closed with ... is read for tags, meetings and mentions', () => {
  assert.ok(scanTags('---\ntags: [work]\n...\nBody').includes('work'));
  assert.ok(isMeetingNote('---\ntype: meeting\n...\n# Standup'));
  assert.deepEqual(findMentions('---\nproject: Apollo\n...\nAbout Apollo.', 'Apollo').map((m) => m.line), [3]);
});
