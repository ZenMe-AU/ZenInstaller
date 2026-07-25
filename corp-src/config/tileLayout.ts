import { MONO as mono } from "./styles";

// App.tsx's own tile-grid layout constants — not reused elsewhere, unlike
// config/styles.ts's cross-file design tokens.

export const groupLabelSx = {
  fontSize: "0.72rem",
  color: "#94a3b8",
  ...mono,
  mt: 3.5,
  mb: 1.25,
  letterSpacing: "0.02em",
  textTransform: "uppercase" as const,
};

// Collapsed tiles are a uniform fixed width and wrap 3-per-row; an expanded tile
// spans exactly that 3-tile width (3 tiles + two 12px gaps) so its right edge lines up.
export const TILE_W = 300;
export const EXPANDED_W = TILE_W * 3 + 24;

export const groupSx = { display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start" } as const;
