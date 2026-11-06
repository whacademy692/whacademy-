// Rank badge SVG generator. Racer = "Speed" chrome shield with stripe + chevrons; Defense = "Core" hexagon with rings.
// Rank 1..20 (idx 0..19). Colour band comes from ranks.js; chevrons/rings count = position inside the band (1..5).
import { rankColor, rankName, bandOfRank } from '../progression/ranks.js';

const esc = (s) => String(s).replace(/[<>&"']/g, '');

export function badgeSVG(rankIdx, { skin = 'speed', size = 96, label = true } = {}) {
  const col = rankColor(rankIdx), n = (rankIdx % 5) + 1, band = bandOfRank(rankIdx);
  const id = `g${rankIdx}${skin}`;
  const name = esc(rankName(rankIdx));
  let shape = '', marks = '';
  if (skin === 'core') {
    shape = `<polygon points="50,6 90,28 90,72 50,94 10,72 10,28" fill="url(#${id})" stroke="${col}" stroke-width="3"/>`;
    for (let i = 0; i < n; i++) marks += `<circle cx="50" cy="50" r="${12 + i * 6}" fill="none" stroke="${col}" stroke-width="1.6" opacity="${0.35 + 0.13 * i}"/>`;
    marks += `<circle cx="50" cy="50" r="5" fill="${col}"/>`;
  } else {
    shape = `<path d="M50 5 L90 18 V52 C90 74 72 88 50 96 C28 88 10 74 10 52 V18 Z" fill="url(#${id})" stroke="${col}" stroke-width="3"/>
      <path d="M50 5 L90 18 V30 L50 18 L10 30 V18 Z" fill="${col}" opacity="0.55"/>
      <rect x="46" y="18" width="8" height="70" fill="${col}" opacity="0.18"/>`;
    for (let i = 0; i < n; i++) marks += `<path d="M30 ${70 - i * 9} L50 ${58 - i * 9} L70 ${70 - i * 9}" fill="none" stroke="${col}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const crown = band === 3 ? `<path d="M34 8 L40 -2 L50 6 L60 -2 L66 8 Z" fill="${col}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 108 112" width="${size}" height="${Math.round(size * 1.04)}" role="img" aria-label="${name}" data-rank="${rankIdx}" data-marks="${n}">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3170"/><stop offset="0.5" stop-color="#11143a"/><stop offset="1" stop-color="#05060f"/></linearGradient></defs>
  ${crown}${shape}${marks}${label ? `<text x="50" y="104" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="${col}">${name}</text>` : ''}</svg>`;
}
