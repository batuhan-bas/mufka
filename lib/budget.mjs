// A budget note: income and expenses kept as two ordinary Markdown tables,
// under headings such as "## Income" and "## Expenses", and a ```budget block
// that shows what they add up to. Pure, on the note's text; the card itself is
// drawn by src/budget-view.js.
//
// ```budget
// currency: ₺
// categories: Rent, Groceries, Transport
// ```
//
// In Obsidian the tables stay plain tables and the block plain code.

const INCOME = /\b(income|incomes|earnings|gelir|gelirler)\b/i;
const EXPENSE = /\b(expense|expenses|spending|costs|gider|giderler|harcama|harcamalar)\b/i;
const COLS = {
  date: /^(date|day|tarih|gün)$/i,
  amount: /^(amount|sum|total|price|cost|tutar|miktar|fiyat)$/i,
  category: /^(category|categories|kategori|tür)$/i,
};

// The block's settings: "key: value" lines.
export function budgetSettings(code) {
  const out = { currency: '', categories: [] };
  for (const line of String(code || '').split('\n')) {
    const m = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'currency') out.currency = m[2];
    else if (key === 'categories') out.categories = m[2].split(',').map((c) => c.trim()).filter(Boolean);
  }
  return out;
}

// "₺1,500", "1.500,50", "-45", "(45)" → a number; null when there is none.
export function parseAmount(text) {
  let s = String(text == null ? '' : text).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || /^-|^−/.test(s.replace(/^[^\d\-−(]+/, ''));
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'); const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Both: the later one is the decimal point.
    const dec = lastDot > lastComma ? '.' : ',';
    s = s.split(dec === '.' ? ',' : '.').join('').replace(dec, '.');
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const parts = s.split(sep);
    // 1,500 / 1.500.000: groups of three are thousands; 12,5 / 9.99 a fraction.
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0);
    s = thousands ? parts.join('') : parts.join('.');
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const cells = (line) => {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|') && !l.endsWith('\\|')) l = l.slice(0, -1);
  return l.split(/(?<!\\)\|/).map((c) => c.trim());
};
const isRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isRule = (line) => isRow(line) && cells(line).every((c) => /^:?-{1,}:?$/.test(c));

// The two tables of a budget note, with what is in them.
//   { income, expenses }: each null or { header, columns, start, end, rows }
//   start/end: 0-based lines of the header and the last row; columns: the index
//   of date / what / category / amount (-1 when there is none); blank: the
//   lines of empty rows.
export function budgetTables(src) {
  const lines = String(src == null ? '' : src).split('\n');
  const found = { income: null, expenses: null };
  let section = null; let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; continue; }
    if (fence) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { section = INCOME.test(h[1]) ? 'income' : EXPENSE.test(h[1]) ? 'expenses' : null; continue; }
    if (!section || found[section] || !isRow(line) || !isRule(lines[i + 1] || '')) continue;
    const header = cells(line);
    let end = i + 1;
    while (end + 1 < lines.length && isRow(lines[end + 1])) end += 1;
    const find = (re) => header.findIndex((c) => re.test(c));
    const amount = find(COLS.amount) !== -1 ? find(COLS.amount) : header.length - 1;
    const date = find(COLS.date);
    const category = find(COLS.category);
    const what = header.findIndex((_, k) => k !== amount && k !== date && k !== category);
    const columns = { date, what, category, amount };
    const rows = []; const blank = [];
    for (let r = i + 2; r <= end; r++) {
      const c = cells(lines[r]);
      if (c.every((x) => !x)) { blank.push(r); continue; } // an empty row to fill in
      const value = parseAmount(c[amount]);
      const text = (k) => (k === -1 ? '' : (c[k] || ''));
      rows.push({ line: r, date: text(date), what: text(what), category: text(category), amount: value || 0 });
    }
    found[section] = { header, columns, start: i, end, rows, blank };
    section = null;
  }
  return found;
}

// What the card shows.
//   { income, expenses, left, spent (share of income, 0..), categories:
//     [{ name, total, share (of expenses) }], currency, hasRows }
export function budgetSummary(src, code) {
  const settings = budgetSettings(code);
  const t = budgetTables(src);
  const sum = (tab) => (tab ? tab.rows.reduce((s, r) => s + r.amount, 0) : 0);
  const income = sum(t.income);
  const expenses = sum(t.expenses);
  const byCat = new Map();
  for (const r of (t.expenses ? t.expenses.rows : [])) {
    const name = r.category || 'Other';
    byCat.set(name, (byCat.get(name) || 0) + r.amount);
  }
  const categories = [...byCat].map(([name, total]) => ({ name, total, share: expenses ? total / expenses : 0 }))
    .sort((a, b) => b.total - a.total);
  return {
    income, expenses, left: income - expenses,
    spent: income ? expenses / income : (expenses ? Infinity : 0),
    categories,
    currency: settings.currency,
    settings,
    tables: t,
    hasRows: Boolean((t.income && t.income.rows.length) || (t.expenses && t.expenses.rows.length)),
  };
}

// The categories to offer when adding an expense: the block's list, then the
// ones already used.
export function categoryChoices(src, code) {
  const out = [];
  const add = (c) => { if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c); };
  budgetSettings(code).categories.forEach(add);
  const t = budgetTables(src);
  if (t.expenses) t.expenses.rows.forEach((r) => add(r.category));
  return out;
}

const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();

// A new row at the end of the income or expenses table; returns the new text.
// entry: { date, what, category, amount } (amount a number). With no table
// yet, the heading and table are added at the end of the note.
export function addBudgetRow(src, kind, entry) {
  const text = String(src == null ? '' : src);
  const lines = text.split('\n');
  const tab = budgetTables(text)[kind];
  const amount = Number.isFinite(entry.amount) ? String(entry.amount) : esc(entry.amount);
  if (!tab) {
    const head = kind === 'income'
      ? ['| Date | Source | Amount |', '|---|---|---:|', `| ${esc(entry.date)} | ${esc(entry.what)} | ${amount} |`]
      : ['| Date | What | Category | Amount |', '|---|---|---|---:|', `| ${esc(entry.date)} | ${esc(entry.what)} | ${esc(entry.category)} | ${amount} |`];
    const tail = text.replace(/\s+$/, '');
    return `${tail}${tail ? '\n\n' : ''}## ${kind === 'income' ? 'Income' : 'Expenses'}\n${head.join('\n')}\n`;
  }
  const { columns, header } = tab;
  const row = header.map((_, k) => {
    if (k === columns.amount) return amount;
    if (k === columns.date) return esc(entry.date);
    if (k === columns.category) return esc(entry.category);
    if (k === columns.what) return esc(entry.what);
    return '';
  });
  // The first empty row after the last entry is filled in; otherwise a new
  // row goes at the end.
  const last = tab.rows.length ? tab.rows[tab.rows.length - 1].line : tab.start + 1;
  const free = tab.blank.find((r) => r > last);
  if (free != null) lines[free] = `| ${row.join(' | ')} |`;
  else lines.splice(tab.end + 1, 0, `| ${row.join(' | ')} |`);
  return lines.join('\n');
}
