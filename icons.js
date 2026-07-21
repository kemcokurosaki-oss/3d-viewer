// アプリ全体で使う軽量インラインSVGアイコン（絵文字の代替）。
// 各アイコンは currentColor を使うので、親要素の color で色を制御できる。
function icon(paths, viewBox = "0 0 24 24") {
  return `<svg class="icon" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export const ICON_CUBE = icon('<path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>');
export const ICON_SEARCH = icon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>');
export const ICON_EDIT = icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
export const ICON_PLUS = icon('<path d="M12 5v14"/><path d="M5 12h14"/>');
export const ICON_EXPAND = icon('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>');
export const ICON_CLOSE = icon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>');
export const ICON_RESET = icon('<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>');
export const ICON_HAND = icon('<path d="M8 13V6a2 2 0 0 1 4 0v6"/><path d="M12 6a2 2 0 0 1 4 0v6"/><path d="M16 8a2 2 0 0 1 4 0v6a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L3.5 13a1.7 1.7 0 0 1 2.8-1.9L8 13"/>');
export const ICON_CLOCK = icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>');
export const ICON_SUN = icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>');
export const ICON_MOON = icon('<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>');
export const ICON_GEAR = icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>');
export const ICON_TRASH = icon('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>');
export const ICON_CHEVRON = icon('<path d="m9 6 6 6-6 6"/>');
