import { Box, Button, CircularProgress, Collapse, MenuItem, Select, TextField, Tooltip, Typography } from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import type { Branch, BranchOption } from "../types";

// ─── Shared input style ───────────────────────────────────────────────────────

const inputSx = {
  "& .MuiInputBase-root": {
    background: "#f8fafc",
    color: "#0f172a",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.8rem",
    borderRadius: "6px",
  },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
  "& .MuiInputBase-input::placeholder": { color: "#94a3b8" },
};

const filterOptions = createFilterOptions<BranchOption>();

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  branches: Branch[];
  selectedBranch: BranchOption | null;
  onBranchChange: (branch: BranchOption | null) => void;
  // New branch creation
  sourceBranch: string;
  onSourceBranchChange: (name: string) => void;
  creating: boolean;
  createError: string | null;
  onCreate: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function BranchCard({
  branches,
  selectedBranch,
  onBranchChange,
  sourceBranch,
  onSourceBranchChange,
  creating,
  createError,
  onCreate,
}: Props) {
  const isNewBranch = selectedBranch?.isNew ?? false;
  const branchOptions: BranchOption[] = branches.map((b) => ({ name: b.name }));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
        Select the branch to run the workflow against. Type a new name to create a branch from an existing one.
      </Typography>

      {/* Branch autocomplete */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Autocomplete
            value={selectedBranch}
            onChange={(_, newVal) => {
              if (typeof newVal === "string") return;
              onBranchChange(newVal);
            }}
            filterOptions={(options, params) => {
              const filtered = filterOptions(options, params);
              if (params.inputValue && !options.find((o) => o.name === params.inputValue)) {
                filtered.push({ name: params.inputValue, isNew: true });
              }
              return filtered;
            }}
            options={branchOptions}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
            isOptionEqualToValue={(o, v) => o.name === v.name}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.82rem" }}>
                {option.isNew ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#2563eb" }}>
                    <AddIcon sx={{ fontSize: 16 }} />
                    Create branch &ldquo;{option.name}&rdquo;
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#0f172a" }}>
                    <CallSplitIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                    {option.name}
                  </Box>
                )}
              </Box>
            )}
            renderInput={(params) => <TextField {...params} placeholder="Select or type branch name..." size="small" sx={inputSx} />}
            size="small"
          />
        </Box>

        {/* Selected branch info */}
        {selectedBranch && !isNewBranch && (
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              px: 1.5,
              py: 0.5,
              borderRadius: "6px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d044",
              color: "#16a34a",
              fontSize: "0.72rem",
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 600,
            }}
          >
            <CallSplitIcon sx={{ fontSize: 13 }} />
            {selectedBranch.name}
          </Box>
        )}
      </Box>

      {/* Create branch panel */}
      <Collapse in={isNewBranch}>
        <Box sx={{ p: 2.5, border: "1px solid #bfdbfe", borderRadius: "10px", background: "#eff6ff" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <CallSplitIcon sx={{ fontSize: 15, color: "#2563eb" }} />
            <Typography sx={{ fontSize: "0.75rem", color: "#2563eb", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
              Create new branch: {selectedBranch?.name}
            </Typography>
          </Box>

          {/* Source branch selector */}
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
              <Typography sx={{ fontSize: "0.72rem", fontFamily: "'IBM Plex Mono', monospace", color: "#475569", fontWeight: 600 }}>
                Source branch
              </Typography>
              <Tooltip title="The new branch will be created from this branch's latest commit">
                <InfoOutlinedIcon sx={{ fontSize: 13, color: "#94a3b8" }} />
              </Tooltip>
            </Box>
            <Select
              size="small"
              value={sourceBranch}
              onChange={(e) => onSourceBranchChange(e.target.value)}
              displayEmpty
              sx={{
                minWidth: 200,
                background: "#ffffff",
                color: "#0f172a",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.8rem",
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "#bfdbfe" },
                "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#93c5fd" },
                "& .MuiSvgIcon-root": { color: "#94a3b8" },
              }}
            >
              {branches.map((b) => (
                <MenuItem key={b.name} value={b.name} sx={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CallSplitIcon sx={{ fontSize: 13, color: "#94a3b8" }} />
                    {b.name}
                    {b.protected && (
                      <Box component="span" sx={{ fontSize: "0.62rem", color: "#f97316", ml: 0.5 }}>
                        protected
                      </Box>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </Box>

          {/* Create error */}
          {createError && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                p: 1.25,
                borderRadius: "6px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
              }}
            >
              <Typography sx={{ fontSize: "0.75rem", color: "#ef4444" }}>{createError}</Typography>
            </Box>
          )}

          <Button
            onClick={onCreate}
            disabled={creating || !sourceBranch}
            variant="contained"
            size="small"
            sx={{
              background: "#2563eb",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.8rem",
              textTransform: "none",
              py: 0.75,
              px: 2.5,
              "&:hover": { background: "#1d4ed8" },
              "&.Mui-disabled": { background: "#bfdbfe", color: "#93c5fd" },
            }}
          >
            {creating ? (
              <>
                <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
                Creating...
              </>
            ) : (
              "Create Branch"
            )}
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}
