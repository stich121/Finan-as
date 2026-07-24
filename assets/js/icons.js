// Ícones em SVG inline (stroke, sem preenchimento) — sem emojis no app.
// Uso: icon('home'), icon('home', { size: 24, className: 'nav-icon' })

const PATHS = {
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M16 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor" stroke="none"/>',
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18"/><path d="M7 14.5h4"/>',
  bank: '<path d="M3 21h18"/><path d="M4 21V10"/><path d="M20 21V10"/><path d="M2 10l10-6 10 6"/><path d="M8 21v-6"/><path d="M12 21v-6"/><path d="M16 21v-6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.65 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.65a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 0 1 4 0v.09A1.7 1.7 0 0 0 15 4.65a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.35 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1"/><path d="M5 8.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5"/><path d="M10 12.5h4"/>',
  play: '<path d="M7 5.5v13l11-6.5-11-6.5Z"/>',
  tag: '<path d="M12.5 3.5H6a2.5 2.5 0 0 0-2.5 2.5v6.5L14 22.5l8.5-8.5L12.5 3.5Z"/><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  filter: '<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10.5 19h3"/>',
  repeat: '<path d="M17 2.5 21 6.5l-4 4"/><path d="M3 12.5v-2a4 4 0 0 1 4-4h14"/><path d="M7 21.5 3 17.5l4-4"/><path d="M21 11.5v2a4 4 0 0 1-4 4H3"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h13l-3 4.5L18 13H5"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  chart: '<path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/>',
};

export function icon(name, { size = 20, className = '' } = {}) {
  const path = PATHS[name] || '';
  const cls = className ? ` class="${className}"` : '';
  return `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
