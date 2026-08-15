// Hardwired per-trove default thumbnails, used as a fallback in list/gallery view
// when an item has no thumbnail of its own. Keyed by trove id (stable identifier
// used throughout the app), not trove name.
const ICON = {
  inkwell: '/icons/troves/inkwell.svg',
  musicNote: '/icons/troves/music-note.svg',
  star: '/icons/troves/star.svg',
  shoppingBag: '/icons/troves/shopping-bag.svg',
  globe: '/icons/troves/globe.svg',
  filmClapperboard: '/icons/troves/film-clapperboard.svg',
  rose: '/icons/troves/rose.svg',
  vinylDisc: '/icons/troves/vinyl-disc.svg',
  video: '/video.svg',
  book: '/book.svg',
} as const

export const TROVE_DEFAULT_THUMBNAIL: Record<string, string> = {
  'tintenfass-little-prince': ICON.inkwell,
  spotify: ICON.musicNote,
  music: ICON.musicNote,
  imdb: ICON.star,
  amazon: ICON.shoppingBag,
  namecheap: ICON.globe,
  porkbun: ICON.globe,
  '101domain': ICON.globe,
  kanopy: ICON.filmClapperboard,
  movies: ICON.filmClapperboard,
  series: ICON.filmClapperboard,
  videos: ICON.video,
  books: ICON.book,
  'little-prince': ICON.rose,
  'little-prince-foundation': ICON.rose,
  vinyl: ICON.vinylDisc,
}
