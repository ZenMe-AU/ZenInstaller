import type { CardStatus } from "../types";

export const PIPELINE_LINE_COLOR: Record<CardStatus, string> = {
  complete: "#22c55e44",
  warning:  "#fed7aa",
  error:    "#fecaca",
  loading:  "#bfdbfe",
  idle:     "#e2e8f0",
  skipped:  "#e2e8f0",
};
