// Tune Up beta — the illustration pieces of the chosen look (2026-10-29): four stacked discs (one per macro) and the
// small protein-streak bars. Shapes and colours follow the approved client-app mockup; nothing louder.
import { t, esc } from './i18n.js';

// four stacked discs, one per macro, in the macro colours (a drawing, not a gauge — the legend carries the numbers)
export function discStack(rows) {
  const ys = [36, 60, 84, 108];
  const discs = rows.slice(0, 4).map((m, i) => { const y = ys[i]; return '<ellipse cx="64" cy="' + y + '" rx="60" ry="15" fill="' + m.color + '"/><ellipse cx="64" cy="' + y + '" rx="40" ry="10" fill="none" stroke="#16130F" stroke-opacity=".2"/>'; }).reverse().join('');
  return '<svg class="discs" viewBox="0 0 150 140" width="128" height="120" role="img" aria-label="' + esc(rows.map(m => t(m.label)).join(', ')) + '"><g transform="translate(12 8)">' + discs + '<ellipse cx="64" cy="36" rx="5" ry="1.5" fill="#16130F"/></g></svg>';
}

// five small bars for the streak chip
export function streakBars() { return '<i class="sbars" aria-hidden="true"><b style="height:4px"></b><b style="height:7px"></b><b style="height:11px"></b><b style="height:6px"></b><b style="height:9px"></b></i>'; }
