import { MONO as mono } from "./styles";

/*
 * App.tsx's own tile-grid layout constants — not reused elsewhere, unlike
 * config/styles.ts's cross-file design tokens.
 */

/*
 * Collapsed tiles are a uniform fixed width and wrap 3-per-row; an expanded tile
 * spans exactly that 3-tile width (3 tiles + two 12px gaps) so its right edge lines up.
 */
export const TILE_W = 300;
export const EXPANDED_W = TILE_W * 3 + 24;

/*
 * Viewport width at which 3 collapsed tiles + gaps + the outer container's sm+
 * horizontal padding (px:4 = 32px each side) first fit without wrapping.
 */
export const TILE_ROW_BREAKPOINT = EXPANDED_W + 64;

export const groupLabelSx = {
  fontSize: "0.72rem",
  color: "#94a3b8",
  ...mono,
  mt: 3.5,
  mb: 1.25,
  letterSpacing: "0.02em",
  textTransform: "uppercase" as const,
  textAlign: "center" as const,
  [`@media (min-width:${TILE_ROW_BREAKPOINT}px)`]: { textAlign: "left" as const },
};

/*
 * Rows center below TILE_ROW_BREAKPOINT (3 tiles can't reliably fit, so any
 * underfull/wrapped row reads as intentional), and left-align at/above it —
 * a group with fewer than 3 tiles (e.g. "Sign in") stays left-anchored there
 * since 3 *would* fit, matching the original left-aligned layout.
 */
export const groupSx = {
  display: "flex",
  flexWrap: "wrap",
  gap: 1.5,
  alignItems: "flex-start",
  justifyContent: "center",
  [`@media (min-width:${TILE_ROW_BREAKPOINT}px)`]: { justifyContent: "flex-start" },
} as const;
