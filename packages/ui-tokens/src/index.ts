// Design tokens shared by web (Tailwind) and mobile (NativeWind). See PLAN.md §6.

export const colors = {
  bg: "#121417",
  surface: "#1c2026",
  border: "#2c323a",
  text: "#e6e8eb",
  textMuted: "#8b949e",
  accentRead: "#2bb3a3",
  accentLike: "#f2715a",
  accentList: "#6c8cff",
  star: "#f2b84b",
} as const;

export const fonts = {
  serif: '"Source Serif 4", Georgia, serif', // titles, review text
  sans: "Inter, system-ui, sans-serif", // UI
} as const;

/** Covers are always 2:3 (width:height). */
export const COVER_ASPECT = 1.5;

/** Pre-generated cover widths in px; heights are width × COVER_ASPECT. */
export const COVER_SIZES = {
  xs: 46, // diary rows
  sm: 70, // lists, feed
  md: 150, // grids
  lg: 230, // book page
  xl: 460, // retina / share images
} as const;

export type CoverSize = keyof typeof COVER_SIZES;

/** Storage path of one resized cover variant, relative to the image CDN root. */
export function coverPath(storageKey: string, size: CoverSize): string {
  return `${storageKey}/${size}.webp`;
}

// Muted backgrounds for generated placeholder covers; all keep light text readable.
const PLACEHOLDER_BACKGROUNDS = [
  "#3b4a6b",
  "#5b3a4e",
  "#2f5d50",
  "#6b4f2a",
  "#4a3b6b",
  "#29505e",
  "#6b3a32",
  "#3f5a2e",
  "#584d3d",
  "#36454f",
] as const;

/** Deterministic colors for a book with no cover art (title + author are drawn on top). */
export function placeholderCover(title: string): { background: string; foreground: string } {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const background = PLACEHOLDER_BACKGROUNDS[hash % PLACEHOLDER_BACKGROUNDS.length] ?? "#36454f";
  return { background, foreground: "#f3efe6" };
}
