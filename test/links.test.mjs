import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWikiInner, remapRel, rewriteVaultLinks } from '../lib/links.mjs';

test('parseWikiInner splits target, heading, alias', () => {
  assert.deepEqual(parseWikiInner('Title'), { target: 'Title', heading: null, alias: null });
  assert.deepEqual(parseWikiInner('Folder/Title'), { target: 'Folder/Title', heading: null, alias: null });
  assert.deepEqual(parseWikiInner('Title|shown'), { target: 'Title', heading: null, alias: 'shown' });
  assert.deepEqual(parseWikiInner('Title#Heading'), { target: 'Title', heading: 'Heading', alias: null });
  assert.deepEqual(parseWikiInner('Folder/Title#Heading|shown'), { target: 'Folder/Title', heading: 'Heading', alias: 'shown' });
  assert.equal(parseWikiInner('  Title  ').target, 'Title');
});

test('remapRel handles notes and folder descendants', () => {
  assert.equal(remapRel('A.md', 'B.md', 'A.md'), 'B.md');
  assert.equal(remapRel('A.md', 'B.md', 'C.md'), 'C.md');
  assert.equal(remapRel('F', 'G', 'F/x.md'), 'G/x.md');
  assert.equal(remapRel('F', 'G', 'F/sub/x.md'), 'G/sub/x.md');
  assert.equal(remapRel('F', 'G', 'Other/x.md'), 'Other/x.md');
});

// Note rename: bare + path inbound links follow, alias + heading preserved.
test('note rename rewrites bare and path links, keeps alias/heading', () => {
  const notes = [
    { rel: 'A.md', content: 'see [[B]] and [[B|the B]] and [[B#Intro]] and [[Folder/B]] done' },
    { rel: 'Folder/B.md', content: '# B' },
  ];
  const { files, linkCount } = rewriteVaultLinks({ notes, oldRel: 'Folder/B.md', newRel: 'Folder/C.md' });
  assert.equal(linkCount, 4);
  assert.equal(files.length, 1);
  assert.equal(files[0].rel, 'A.md');
  assert.equal(files[0].content, 'see [[C]] and [[C|the B]] and [[C#Intro]] and [[Folder/C]] done');
});

// Same-title notes in different folders: only the one that actually resolved to
// the renamed note is rewritten.
test('same-title note elsewhere is not touched', () => {
  const notes = [
    { rel: 'X/note.md', content: '[[Target]]' }, // resolves to X/Target (same folder)
    { rel: 'X/Target.md', content: '' },
    { rel: 'Y/Target.md', content: '' },
    { rel: 'Y/note.md', content: '[[Target]]' }, // resolves to Y/Target
  ];
  const { files } = rewriteVaultLinks({ notes, oldRel: 'X/Target.md', newRel: 'X/Renamed.md' });
  assert.equal(files.length, 1);
  assert.equal(files[0].rel, 'X/note.md');
  assert.equal(files[0].content, '[[Renamed]]');
});

// Links inside inline code and fenced blocks are left alone.
test('links in code are not rewritten', () => {
  const src = [
    'real [[B]]',
    'inline `[[B]]` stays',
    '```',
    '[[B]] in fence',
    '```',
    'end [[B]]',
  ].join('\n');
  const notes = [{ rel: 'A.md', content: src }, { rel: 'B.md', content: '' }];
  const { files, linkCount } = rewriteVaultLinks({ notes, oldRel: 'B.md', newRel: 'C.md' });
  assert.equal(linkCount, 2);
  assert.equal(files[0].content, [
    'real [[C]]',
    'inline `[[B]]` stays',
    '```',
    '[[B]] in fence',
    '```',
    'end [[C]]',
  ].join('\n'));
});

// Folder rename rewrites path links through it; bare links (unchanged title)
// are left byte-identical.
test('folder rename rewrites path links, leaves bare links', () => {
  const notes = [
    { rel: 'A.md', content: '[[Old/Rapor]] and [[Rapor]]' },
    { rel: 'Old/Rapor.md', content: '' },
  ];
  const { files, linkCount } = rewriteVaultLinks({ notes, oldRel: 'Old', newRel: 'Yeni' });
  assert.equal(linkCount, 1); // only the path link
  assert.equal(files[0].content, '[[Yeni/Rapor]] and [[Rapor]]');
});

// Bare link falls back to a path link when the bare title would resolve to a
// DIFFERENT same-title note after the move.
test('bare link falls back to path when ambiguous after move', () => {
  const notes = [
    { rel: 'A.md', content: '[[Rapor]]' }, // resolves to root Rapor (same folder)
    { rel: 'Rapor.md', content: '' },
    { rel: 'Other/Rapor.md', content: '' }, // another same-title note
  ];
  // Move root Rapor into Sub/. Afterwards bare [[Rapor]] from root would prefer
  // Other/Rapor (Turkish order), so the link must become a path link.
  const { files } = rewriteVaultLinks({ notes, oldRel: 'Rapor.md', newRel: 'Sub/Rapor.md' });
  assert.equal(files[0].content, '[[Sub/Rapor]]');
});

test('no changes returns empty files', () => {
  const notes = [{ rel: 'A.md', content: 'no links here' }, { rel: 'B.md', content: '' }];
  const { files, linkCount } = rewriteVaultLinks({ notes, oldRel: 'B.md', newRel: 'C.md' });
  assert.equal(files.length, 0);
  assert.equal(linkCount, 0);
});
