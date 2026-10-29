// Tune Up beta — language + text helpers. English strings are the keys; Georgian lives in ka.js.
import { KA as KA1 } from './ka.js';
import { KA2 } from './ka2.js';
import { KA3 } from './ka3.js';
import { KA4 } from './ka4.js';
import { KA5 } from './ka5.js';
import { KA6 } from './ka6.js';
import { KA7 } from './ka7.js';
import { KA8 } from './ka8.js';
import { KA9 } from './ka9.js';
import { KA10 } from './ka10.js';
import { KA11 } from './ka11.js';
import { KA12 } from './ka12.js';
const KA = Object.assign({}, KA1, KA2, KA3, KA4, KA5, KA6, KA7, KA8, KA9, KA10, KA11, KA12);

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
const HUES = ['#E8632B', '#2A9A90', '#8E6FD6', '#D9A520', '#D9456A', '#7E8A2E'];
export function hue(id) { let h = 0; for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }

// weekdays 1..7 (Monday first) and local dates
const DAYS_FULL = { en: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], ka: ['ორშაბათი','სამშაბათი','ოთხშაბათი','ხუთშაბათი','პარასკევი','შაბათი','კვირა'] };
const DAYS_SHORT2 = { en: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], ka: ['ორშ','სამ','ოთხ','ხუთ','პარ','შაბ','კვი'] };
export function dayName(d, short) { return (short ? DAYS_SHORT2 : DAYS_FULL)[LANG.cur][(d - 1) % 7]; }
export function weekdayOf(date) { const g = (date || new Date()).getDay(); return g === 0 ? 7 : g; }
export function isoDate(date) { const d = date || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
export function weekOf(iso) { const w = weekdayOf(new Date(iso + 'T00:00:00')); const mon = addDays(iso, 1 - w); return [0, 1, 2, 3, 4, 5, 6].map(i => addDays(mon, i)); }
export function fmtDay(iso, opt) { return fmtDate(new Date(iso + 'T00:00:00'), opt); }
export const MOODS = { 1: 'Rough', 2: 'Low', 3: 'OK', 4: 'Good', 5: 'Great' };
export function mood(v) { return MOODS[v] ? t(MOODS[v]) : ''; }
export function exName(x) { if (!x) return ''; return (LANG.cur === 'ka' && x.name_ka) ? x.name_ka : x.name; }
export function exMuscle(x) { if (!x) return ''; return (LANG.cur === 'ka' && x.muscle_ka) ? x.muscle_ka : x.muscle; }
// short macro labels for tight spots (rings, macro strips); the full words stay in t()
export function macroShort(k) { const M = { en: { kcal: 'kcal', protein_g: 'protein', carbs_g: 'carbs', fat_g: 'fats', Calories: 'Calories', Protein: 'Protein', Carbs: 'Carbs', Fats: 'Fats', Light: 'Light' }, ka: { kcal: 'კკალ', protein_g: 'ცილა', carbs_g: 'ნახშირწ.', fat_g: 'ცხიმი', Calories: 'კალორია', Protein: 'ცილა', Carbs: 'ნახშირწ.', Fats: 'ცხიმი', Light: 'მსუბუქი' } }; return (M[LANG.cur] || M.en)[k] || k; }
export function unit(u) { return LANG.cur === 'ka' ? ({ kg: 'კგ', cm: 'სმ', kcal: 'კკალ', g: 'გ', ml: 'მლ', min: 'წთ', L: 'ლ' }[u] || u) : u; }

// option labels shared by forms (stored as English keys)
export const OPTS = {
  experience: { beginner: 'Beginner', some: 'Some experience', regular: 'Train regularly' },
  eating_style: { '': 'Not set', normal: 'Eat everything', vegetarian: 'Vegetarian', vegan: 'Vegan', nopork: 'No pork', fasting: 'Fasting (Orthodox)' },
  goal: { lose: 'Lose fat', gain: 'Build muscle', tone: 'Get fit and toned', health: 'Health and energy', sport: 'Sport performance' },
  format: { inperson: 'In person', online: 'Online', either: 'In person or online' },
  specialty: { strength: 'Strength', fatloss: 'Fat loss', hypertrophy: 'Muscle', mobility: 'Mobility', running: 'Running', rehab: 'After injury', women: 'Women’s fitness', seniors: '50+' }
};
export function opt(group, key) { const g = OPTS[group] || {}; return g[key] ? t(g[key]) : (key || ''); }
