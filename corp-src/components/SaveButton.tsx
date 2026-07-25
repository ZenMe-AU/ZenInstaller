import { Button, CircularProgress } from "@mui/material";
import { MONO } from "../config/styles";

type Props = {
  verb: string; // "Save" | "Update"
  noun: string; // "variable" | "secret"
  count: number; // number of dirty/pending items
  loading: boolean;
  disabled?: boolean; // Defaults to `loading || count === 0`; pass to add extra gating.
  onClick: () => void;
};

/*
 * The blue contained "Save N variables" / "Update N secrets" button shared by the
 * variable and secret editors.
 */
export default function SaveButton({ verb, noun, count, loading, disabled, onClick }: Props) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled ?? (loading || count === 0)}
      variant="contained"
      size="small"
      sx={{
        background: "#2563eb",
        ...MONO,
        fontSize: "0.75rem",
        textTransform: "none",
        py: 0.75,
        px: 2,
        "&:hover": { background: "#1d4ed8" },
        "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
      }}
    >
      {loading ? (
        <>
          <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
          Updating...
        </>
      ) : (
        `${verb} ${count > 0 ? count : ""} ${noun}${count !== 1 ? "s" : ""}`.trim()
      )}
    </Button>
  );
}
