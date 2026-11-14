import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobsSettings, mayBeJob, jobOf, jobColumns, jobStats, daysSince, jobNoteName, DEFAULT_STAGES } from '../lib/jobs.mjs';

const NOTE = (status, company = 'Acme', date = '2026-10-20') => `---
company: ${company}
role: Senior Frontend Developer
status: "${status}" # Applied, Phone Screen, Technical, Final, Offer, Rejected
application_date: ${date}
location: "Remote"
tech_stack: [TypeScript, React]
link: https://acme.example/jobs/1
---
# Notes
`;

test('jobsSettings: stages, template, folder', () => {
  assert.deepEqual(jobsSettings(''), { stages: DEFAULT_STAGES, template: '', folder: '' });
  assert.deepEqual(jobsSettings('stages: Wishlist, Applied, Offer, Rejected\ntemplate: Job Tracker\nfolder: /Jobs/'), { stages: ['Wishlist', 'Applied', 'Offer'], template: 'Job Tracker', folder: 'Jobs' });
});

test('jobOf reads an application note (the author\'s template as it is)', () => {
  const j = jobOf('Jobs/Acme.md', NOTE('Applied'));
  assert.equal(j.company, 'Acme');
  assert.equal(j.role, 'Senior Frontend Developer');
  assert.equal(j.status, 'Applied');
  assert.equal(j.applied, '2026-10-20');
  assert.equal(j.location, 'Remote');
  assert.equal(j.link, 'https://acme.example/jobs/1');
  assert.equal(jobOf('x.md', '# just a note'), null);
  assert.equal(jobOf('x.md', '---\ncompany: A\n---\n'), null); // no status
  assert.ok(jobOf('x.md', '---\ntype: job\nrole: Dev\n---\n'));
  assert.ok(mayBeJob(NOTE('Offer')));
});

test('jobColumns: stages in order, unknown statuses after, Rejected last', () => {
  const jobs = [jobOf('a', NOTE('Applied', 'A', '2026-10-01')), jobOf('b', NOTE('Applied', 'B', '2026-10-05')), jobOf('c', NOTE('Final', 'C')), jobOf('d', NOTE('rejected', 'D')), jobOf('e', NOTE('On hold', 'E')), jobOf('f', NOTE('', 'F'))];
  const cols = jobColumns(jobs);
  assert.deepEqual(cols.map((c) => c.stage), ['Applied', 'Phone Screen', 'Technical', 'Final', 'Offer', 'On hold', 'Rejected']);
  assert.deepEqual(cols[0].jobs.map((j) => j.company), ['F', 'B', 'A']); // no status: the first stage; newest first
  assert.deepEqual(cols[6].jobs.map((j) => j.company), ['D']);
});

test('jobStats: response rate and counts', () => {
  const jobs = ['Applied', 'Applied', 'Phone Screen', 'Technical', 'Offer', 'Rejected'].map((s, i) => jobOf(String(i), NOTE(s)));
  assert.deepEqual(jobStats(jobs), { total: 6, active: 4, interviewing: 2, offers: 1, rejected: 1, responseRate: 4 / 6 });
  assert.equal(jobStats([]).responseRate, 0);
});

test('daysSince and note names', () => {
  assert.equal(daysSince('2026-10-20', new Date(2026, 10, 2, 15)), 13);
  assert.equal(daysSince('', new Date()), null);
  assert.equal(jobNoteName({ company: 'Acme/Inc', role: 'Dev: Senior' }), 'Acme Inc – Dev Senior');
  assert.equal(jobNoteName({ company: '', role: '' }), 'New application');
});

test('setJobStatus keeps the quotes and the comment', async () => {
  const { setJobStatus } = await import('../lib/jobs.mjs');
  const { setProp } = await import('../lib/properties.mjs');
  const moved = setJobStatus(NOTE('Applied'), 'Phone Screen', setProp);
  assert.match(moved, /^status: "Phone Screen" # Applied, Phone Screen, Technical, Final, Offer, Rejected$/m);
  assert.equal(moved.replace(/^status:.*$/m, ''), NOTE('Applied').replace(/^status:.*$/m, ''));
  assert.match(setJobStatus('---\nstatus: Applied\n---\n', 'Offer', setProp), /^status: Offer$/m);
  assert.match(setJobStatus('---\ncompany: A\n---\n', 'Offer', setProp), /^status: Offer$/m);
});

test('notes saved with Windows line endings (CRLF)', async () => {
  const { setJobStatus } = await import('../lib/jobs.mjs');
  const { setProp } = await import('../lib/properties.mjs');
  const crlf = '---\r\ntype: job\r\ncompany: Acme\r\nstatus: "Applied" # Applied, Offer\r\n---\r\nBody\r\n';
  assert.ok(mayBeJob(crlf));
  assert.equal(setJobStatus(crlf, 'Offer', setProp), crlf.replace('"Applied"', '"Offer"'));
  const { scanTags } = await import('../lib/tags.mjs');
  assert.deepEqual(scanTags('---\r\ntags: [gezi/izmir]\r\n---\r\nText #iş\r\n'), ['gezi/izmir', 'iş']);
});
