// Pure template filling, compatible with Obsidian's core Templates plugin:
// {{title}}, {{date}}, {{time}}, and {{date:FORMAT}} / {{time:FORMAT}} with
// Moment-style tokens (the subset Obsidian users actually use).

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n, w = 2) => String(n).padStart(w, '0');

const TOKENS = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DDDD|DD|Do|D|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|A|a|ww|w|E/g;

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

export function formatDate(d, fmt) {
  return String(fmt).replace(TOKENS, (tok, lit) => {
    if (lit !== undefined) return lit;
    const h = d.getHours();
    switch (tok) {
      case 'YYYY': return String(d.getFullYear());
      case 'YY': return pad(d.getFullYear() % 100);
      case 'MMMM': return MONTHS[d.getMonth()];
      case 'MMM': return MONTHS[d.getMonth()].slice(0, 3);
      case 'MM': return pad(d.getMonth() + 1);
      case 'M': return String(d.getMonth() + 1);
      case 'DDDD': return pad(Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1, 3);
      case 'DD': return pad(d.getDate());
      case 'Do': return ordinal(d.getDate());
      case 'D': return String(d.getDate());
      case 'dddd': return DAYS[d.getDay()];
      case 'ddd': return DAYS[d.getDay()].slice(0, 3);
      case 'dd': return DAYS[d.getDay()].slice(0, 2);
      case 'd': return String(d.getDay());
      case 'E': return String(d.getDay() || 7);
      case 'HH': return pad(h);
      case 'H': return String(h);
      case 'hh': return pad(h % 12 || 12);
      case 'h': return String(h % 12 || 12);
      case 'mm': return pad(d.getMinutes());
      case 'm': return String(d.getMinutes());
      case 'ss': return pad(d.getSeconds());
      case 's': return String(d.getSeconds());
      case 'A': return h < 12 ? 'AM' : 'PM';
      case 'a': return h < 12 ? 'am' : 'pm';
      case 'ww': return pad(isoWeek(d));
      case 'w': return String(isoWeek(d));
      default: return tok;
    }
  });
}

// ctx: { title, date: Date, dateFormat = 'YYYY-MM-DD', timeFormat = 'HH:mm' }
export function applyTemplate(text, ctx) {
  const date = ctx.date || new Date();
  const df = ctx.dateFormat || 'YYYY-MM-DD';
  const tf = ctx.timeFormat || 'HH:mm';
  return String(text).replace(/\{\{\s*(title|date|time)(?::([^}]*))?\s*\}\}/gi, (_m, name, fmt) => {
    const n = name.toLowerCase();
    if (n === 'title') return ctx.title || '';
    return formatDate(date, fmt != null && fmt.trim() ? fmt.trim() : (n === 'date' ? df : tf));
  });
}
