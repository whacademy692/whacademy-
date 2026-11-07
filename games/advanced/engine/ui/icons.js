// Vector icon set for the Advanced Games UI (no emoji anywhere). 24x24 grid, inline SVG strings.
// icon(name, {size, cls}) -> markup. Colour follows `currentColor`, so CSS decides the colour.

const S = (d) => ({ s: d });                       // stroked outline icon
const F = (d) => ({ f: d });                       // solid icon

export const ICONS = {
  heart:   F('<path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 2.9 4 6.6 4c2.1 0 3.6 1 5.4 3 1.8-2 3.3-3 5.4-3 3.7 0 5.7 4.2 4.2 7.6C19.5 16.4 12 21 12 21z"/>'),
  heartOutline: S('<path d="M12 21s-7.5-4.6-9.6-9.4C.9 8.2 2.9 4 6.6 4c2.1 0 3.6 1 5.4 3 1.8-2 3.3-3 5.4-3 3.7 0 5.7 4.2 4.2 7.6C19.5 16.4 12 21 12 21z"/>'),
  snow:    S('<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/>'),
  skip:    F('<path d="M5 4.5v15l10-7.5z"/><rect x="17" y="4.5" width="2.6" height="15" rx="1"/>'),
  fifty:   F('<path d="M12 3a9 9 0 0 0 0 18z"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>'),
  flame:   F('<path d="M12 2c.6 3.2-1.4 4.6-3 6.4C7.4 10.2 6 12 6 14.6A6 6 0 0 0 18 15c0-2.4-1-4-2.4-5.4.1 1.8-.7 2.8-1.7 3.1C14.6 10.2 14 5 12 2z"/>'),
  coin:    F('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.6"/><path d="M12 8.6v6.8M9.8 10.4c0-1 1-1.6 2.2-1.6s2.2.6 2.2 1.6-1 1.4-2.2 1.6-2.2.6-2.2 1.6 1 1.6 2.2 1.6 2.2-.6 2.2-1.6" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1.2" stroke-linecap="round"/>'),
  lock:    F('<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.4"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
  pause:   F('<rect x="5.5" y="4.5" width="4.6" height="15" rx="1.4"/><rect x="13.9" y="4.5" width="4.6" height="15" rx="1.4"/>'),
  play:    F('<path d="M7 4.2v15.6a1 1 0 0 0 1.5.9l12.4-7.8a1 1 0 0 0 0-1.7L8.5 3.3A1 1 0 0 0 7 4.2z"/>'),
  sliders: S('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1.5 14h5M9.5 8h5M17.5 16h5"/>'),
  car:     S('<path d="M5 17H3.5a1 1 0 0 1-1-1v-3.4a2.6 2.6 0 0 1 .8-1.9L5.2 8.4A2 2 0 0 1 6.6 7.8h6.6a2 2 0 0 1 1.5.7L17 11h2.6a2 2 0 0 1 1.9 2v3a1 1 0 0 1-1 1H19"/><circle cx="7.5" cy="17" r="2.2"/><circle cx="16.5" cy="17" r="2.2"/><path d="M9.7 17h4.6M5 11h10"/>'),
  bolt:    F('<path d="M13.6 2 4.5 13.4a.6.6 0 0 0 .5 1h5.1l-1.2 7.4a.4.4 0 0 0 .7.3l9.4-11.7a.6.6 0 0 0-.5-1h-5.3l1.7-6.7a.4.4 0 0 0-.7-.4z"/>'),
  trophy:  S('<path d="M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9.5 18h5"/>'),
  sun:     S('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'),
  moon:    F('<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a.5.5 0 0 0-.7-.5A9.5 9.5 0 1 0 21 14.9a.5.5 0 0 0-.5-.7z"/>'),
  shield:  S('<path d="M12 21.5s7.5-3.6 7.5-9.6V5.3L12 2.5 4.5 5.3v6.6c0 6 7.5 9.6 7.5 9.6z"/>'),
  check:   S('<path d="M4.5 12.5l5 5 10-11"/>'),
  close:   S('<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>'),
  star:    F('<path d="M12 2.6l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17l-5.7 3.1 1.1-6.3L2.8 9.3l6.4-.9z"/>'),
  flag:    S('<path d="M5 21V4M5 4.5c4-2 7 2 11 0v8c-4 2-7-2-11 0"/>'),
  home:    S('<path d="M3.5 11.5L12 4l8.5 7.5M6 10v10h12V10"/>'),
  back:    S('<path d="M15 5l-7 7 7 7"/>'),
  up:      S('<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>'),
  gauge:   S('<path d="M4.5 17a8.5 8.5 0 1 1 15 0M12 13.5l4-4"/><circle cx="12" cy="14" r="1.2"/>'),
  wrench:  S('<path d="M14.5 6.5a4 4 0 0 0 4.6 5.4l-7.7 7.7a2.1 2.1 0 0 1-3-3l7.7-7.7a4 4 0 0 0-1.6-2.4z"/>'),
  target:  S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  list:    S('<path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  user:    S('<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5"/>'),
  menu:    S('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  left:    F('<path d="M15.5 4.2 6.2 11.1a1.1 1.1 0 0 0 0 1.8l9.3 6.9a1.1 1.1 0 0 0 1.7-.9V5.1a1.1 1.1 0 0 0-1.7-.9z"/>'),
  right:   F('<path d="M8.5 4.2l9.3 6.9a1.1 1.1 0 0 1 0 1.8l-9.3 6.9a1.1 1.1 0 0 1-1.7-.9V5.1a1.1 1.1 0 0 1 1.7-.9z"/>'),
  go:      F('<path d="M12 3.2 3.6 18.4a.9.9 0 0 0 1.2 1.2L12 16l7.2 3.6a.9.9 0 0 0 1.2-1.2z"/>'),
  swap:    S('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  help:    S('<circle cx="12" cy="12" r="9.2"/><path d="M9.4 9.4a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1-1.3 2M12 17.2h.01"/>'),
  eye:     S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  medal:   S('<circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 3l3.5 6 3.5-6M12 12v5"/>'),
};

/** Markup for one icon. `size` in px (default 20). */
export function icon(name, { size = 20, cls = '' } = {}) {
  const it = ICONS[name];
  if (!it) return '';
  const common = `class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"`;
  if (it.f) return `<svg ${common} fill="currentColor">${it.f}</svg>`;
  return `<svg ${common} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.s}</svg>`;
}
