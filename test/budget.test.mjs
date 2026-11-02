import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, budgetSettings, budgetTables, budgetSummary, categoryChoices, addBudgetRow } from '../lib/budget.mjs';

const NOTE = `---
icon: 💰
---
\`\`\`budget
currency: ₺
categories: Rent, Groceries, Transport
\`\`\`

## Income
| Date | Source | Amount |
|---|---|---:|
| 2026-10-01 | Salary | 40,000 |
| 2026-10-18 | Freelance | ₺5.000 |
| | | |

## Expenses
| Date | What | Category | Amount |
|---|---|---|---:|
| 2026-10-01 | Rent | Rent | 16000 |
| 2026-10-03 | Weekly shop | Groceries | 2140,50 |
| 2026-10-04 | Coffee | | 120 |

## Notes
| a | b |
|---|---|
| 1 | 2 |
`;

test('parseAmount reads the usual ways of writing money', () => {
  assert.equal(parseAmount('1,500'), 1500);
  assert.equal(parseAmount('1.500'), 1500);
  assert.equal(parseAmount('1.500.000'), 1500000);
  assert.equal(parseAmount('1,234.56'), 1234.56);
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount('9.99'), 9.99);
  assert.equal(parseAmount('₺ 640'), 640);
  assert.equal(parseAmount('$-45'), -45);
  assert.equal(parseAmount('(45)'), -45);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('n/a'), null);
});

test('budgetSettings reads currency and categories', () => {
  assert.deepEqual(budgetSettings('currency: €\ncategories: A, B ,, C'), { currency: '€', categories: ['A', 'B', 'C'] });
  assert.deepEqual(budgetSettings(''), { currency: '', categories: [] });
});

test('budgetTables finds the tables under the income and expenses headings', () => {
  const t = budgetTables(NOTE);
  assert.equal(t.income.start, 9);
  assert.equal(t.income.end, 13);
  assert.equal(t.income.rows.length, 2); // the empty row is not an entry
  assert.deepEqual(t.expenses.columns, { date: 0, what: 1, category: 2, amount: 3 });
  assert.equal(t.expenses.rows[1].amount, 2140.5);
  assert.equal(t.expenses.rows[1].line, 19);
});

test('a table inside a code block is not read', () => {
  const t = budgetTables('## Income\n```\n| a | Amount |\n|---|---|\n| x | 5 |\n```\n');
  assert.equal(t.income, null);
});

test('budgetSummary adds it up', () => {
  const s = budgetSummary(NOTE, 'currency: ₺');
  assert.equal(s.income, 45000);
  assert.equal(s.expenses, 18260.5);
  assert.equal(s.left, 26739.5);
  assert.ok(Math.abs(s.spent - 18260.5 / 45000) < 1e-9);
  assert.deepEqual(s.categories.map((c) => c.name), ['Rent', 'Groceries', 'Other']);
  assert.equal(s.currency, '₺');
  assert.equal(s.hasRows, true);
});

test('Turkish headings work too', () => {
  const s = budgetSummary('## Gelirler\n| Tarih | Kaynak | Tutar |\n|---|---|---|\n| 1 | Maaş | 100 |\n## Giderler\n| Tarih | Açıklama | Kategori | Tutar |\n|---|---|---|---|\n| 1 | Kira | Ev | 60 |\n', '');
  assert.equal(s.income, 100);
  assert.equal(s.left, 40);
  assert.equal(s.categories[0].name, 'Ev');
});

test('categoryChoices: the block list first, then the used ones', () => {
  assert.deepEqual(categoryChoices(NOTE, 'categories: Rent, Groceries, Transport'), ['Rent', 'Groceries', 'Transport']);
  assert.deepEqual(categoryChoices(NOTE, 'categories: Bills'), ['Bills', 'Rent', 'Groceries']);
});

test('addBudgetRow puts the row at the end of the table, in its column order', () => {
  const out = addBudgetRow(NOTE, 'expenses', { date: '2026-10-29', what: 'Beans | coffee', category: 'Groceries', amount: 640 });
  const lines = out.split('\n');
  assert.equal(lines[21], '| 2026-10-29 | Beans \\| coffee | Groceries | 640 |');
  assert.equal(lines[22], '');
  assert.equal(budgetSummary(out, '').expenses, 18900.5);
  const inc = addBudgetRow(NOTE, 'income', { date: '2026-10-30', what: 'Gift', amount: 100 });
  assert.equal(inc.split('\n')[13], '| 2026-10-30 | Gift | 100 |'); // fills the empty row
  assert.equal(budgetTables(inc).income.end, 13);
});

test('addBudgetRow adds the table when there is none', () => {
  const out = addBudgetRow('# Budget\n', 'expenses', { date: 'd', what: 'w', category: 'c', amount: 5 });
  assert.equal(out, '# Budget\n\n## Expenses\n| Date | What | Category | Amount |\n|---|---|---|---:|\n| d | w | c | 5 |\n');
  assert.equal(budgetSummary(out, '').expenses, 5);
});

test('months: shift, read and start the next one', async () => {
  const { shiftMonth, budgetMonth, nextMonthText } = await import('../lib/budget.mjs');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('nope', 1), null);
  assert.equal(budgetMonth([{ key: 'month', value: '2026-10' }], 'x'), '2026-10');
  assert.equal(budgetMonth([], 'Budget 2026-09'), '2026-09');
  assert.equal(budgetMonth([], 'Budget'), null);
  const next = nextMonthText(`---\ntype: budget\nmonth: 2026-10\n---\n${NOTE.split('---\n').slice(2).join('---\n')}`, '2026-11');
  assert.match(next, /^month: 2026-11$/m);
  const t = budgetTables(next);
  assert.equal(t.income.rows.length + t.expenses.rows.length, 0);
  assert.match(next, /\| Date \| What \| Category \| Amount \|\n\|---\|---\|---\|---:\|\n\n## Notes/);
  assert.match(next, /categories: Rent, Groceries, Transport/);
});
