// Tune Up beta — language + text helpers. English strings are the keys; Georgian lives in ka.js.
import { KA } from './ka.js';

export const LANG = { cur: 'en' };
try { const l = localStorage.getItem('tuneup-lang'); if (l === 'ka' || l === 'en') LANG.cur = l; } catch (e) {}

export function setLang(l) {
  LANG.cur = l === 'ka' ? 'ka' : 'en';
  try { localStorage.setItem('tuneup-lang', LANG.cur); } catch (e) {}
  document.documentElement.setAttribute('lang', LANG.cur);
}

export function t(s, vars) {
  let out = (LANG.cur === 'ka' && KA[s]) ? KA[s] : s;
  if (vars) Object.keys(vars).forEach(k => { out = out.split('{' + k + '}').join(vars[k]); });
  return out;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MONTHS = { en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], ka: ['იან','თებ','მარ','აპრ','მაი','ივნ','ივლ','აგვ','სექ','ოქტ','ნოე','დეკ'] };
const DAYS = { en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'], ka: ['კვი','ორშ','სამ','ოთხ','ხუთ','პარ','შაბ'] };

export function fmtDate(ts, opt) {
  if (!ts) return '';
  const d = new Date(ts);
  const m = MONTHS[LANG.cur][d.getMonth()];
  if (opt === 'dm') return d.getDate() + ' ' + m;
  if (opt === 'full') return DAYS[LANG.cur][d.getDay()] + ' ' + d.getDate() + ' ' + m + ' ' + d.getFullYear();
  return DAYS[LANG.cur][d.getDay()] + ' ' + d.getDate() + ' ' + m;
}
export function fmtTime(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
export function firstName(n) { return String(n || '').trim().split(' ')[0]; }
export function initials(n) { return String(n || '?').trim().split(' ').map(x => x[0] || '').slice(0, 2).join('').toUpperCase() || '?'; }
const HUES = ['#9C3B08', '#4A6B8A', '#4F7A4A', '#C2960E', '#7A2E06', '#6F6B64'];
export function hue(id) { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }

// weekdays 1..7 (Monday first) and local dates
const DAYS_FULL = { en: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], ka: ['ორშაბათი','სამშაბათი','ოთხშაბათი','ხუთშაბათი','პარასკევი','შაბათი','კვირა'] };
const DAYS_SHORT2 = { en: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], ka: ['ორშ','სამ','ოთხ','ხუთ','პარ','შაბ','კვი'] };
export function dayName(d, short) { return (short ? DAYS_SHORT2 : DAYS_FULL)[LANG.cur][(d - 1) % 7]; }
export function weekdayOf(date) { const g = (date || new Date()).getDay(); return g === 0 ? 7 : g; }
export function isoDate(date) { const d = date || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function exName(x) { if (!x) return ''; return (LANG.cur === 'ka' && x.name_ka) ? x.name_ka : x.name; }
export function exMuscle(x) { if (!x) return ''; return (LANG.cur === 'ka' && x.muscle_ka) ? x.muscle_ka : x.muscle; }
export function unit(u) { return LANG.cur === 'ka' ? ({ kg: 'კგ', cm: 'სმ', kcal: 'კკალ', g: 'გ', ml: 'მლ', min: 'წთ' }[u] || u) : u; }

// option labels shared by forms (stored as English keys)
export const OPTS = {
  experience: { beginner: 'Beginner', some: 'Some experience', regular: 'Train regularly' },
  goal: { lose: 'Lose fat', gain: 'Build muscle', tone: 'Get fit and toned', health: 'Health and energy', sport: 'Sport performance' },
  format: { inperson: 'In person', online: 'Online', either: 'In person or online' },
  specialty: { strength: 'Strength', fatloss: 'Fat loss', hypertrophy: 'Muscle', mobility: 'Mobility', running: 'Running', rehab: 'After injury', women: 'Women’s fitness', seniors: '50+' }
};
export function opt(group, key) { const g = OPTS[group] || {}; return g[key] ? t(g[key]) : (key || ''); }
