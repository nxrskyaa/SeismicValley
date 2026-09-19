// Small line drawings for the field journal. All assets stay local.
const paths = {
  journal: '<path d="M5 4h13a2 2 0 0 1 2 2v15H6a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z"/><path d="M7 4v17M11 4v8l3-2 3 2V4M3 17h17"/>',
  homestead: '<path d="m3 11 9-8 9 8M5 9v12h14V9M10 21v-7h4v7M16 6V3h3v6"/>',
  market: '<path d="M4 10v11h16V10M2 10l3-7h14l3 7M2 10q2 4 5 0 2 4 5 0 2 4 5 0 3 4 5 0M9 21v-7h6v7"/>',
  village: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-4a7 7 0 0 1 14 0v4M16 4a3 3 0 0 1 0 6M19 21v-5a6 6 0 0 0-2-4"/>',
  bag: '<path d="M5 9h14l2 12H3L5 9ZM8 9V6a4 4 0 0 1 8 0v3M8 13h8M10 16h4"/>',
  build: '<path d="m4 20 11-11M12 5l4-3 6 6-3 4-7-7ZM2 18l4 4M5 4l15 16M3 2l5 2-4 4-2-5"/>',
  guide: '<path d="M12 4C9 1 3 3 3 3v17s6-2 9 1c3-3 9-1 9-1V3s-6-2-9 1Zm0 0v17M6 7l3 1M6 11l3 1M15 8l3-1M15 12l3-1"/>',
  save: '<path d="M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/>',
  leaf: '<path d="M5 19C-2 8 11 3 21 3c0 11-4 19-13 15M3 22 17 8M8 17v-6M12 13h6"/>',
  water: '<path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13ZM8 15a4 4 0 0 0 4 4"/>',
}
export const emblem = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.journal}</svg>`
