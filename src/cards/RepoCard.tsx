import { Box, Button, CircularProgress, Collapse, FormControlLabel, MenuItem, Select, Switch, TextField, Tooltip, Typography } from "@mui/material";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import BusinessIcon from "@mui/icons-material/Business";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PersonIcon from "@mui/icons-material/Person";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, Branch, Repo, RepoOption } from "../types";
import { VALID_ENV_NAMES } from "../types";

// ─── Template status badge ────────────────────────────────────────────────────

type TemplateStatus = "checking" | "ready" | "not_clone";

const TEMPLATE_STATUS_CONFIG = {
  ready: { label: "Ready", color: "#16a34a", bg: "#f0fdf4", icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
  not_clone: { label: "Not a Clone of Template", color: "#ea580c", bg: "#fff7ed", icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> },
  checking: { label: "Checking...", color: "#64748b", bg: "#f1f5f9", icon: <CircularProgress size={12} sx={{ color: "#64748b" }} /> },
} as const;

function TemplateBadge({ status }: { status: TemplateStatus }) {
  const cfg = TEMPLATE_STATUS_CONFIG[status];
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        borderRadius: "6px",
        background: cfg.bg,
        border: `1px solid ${cfg.color}44`,
        color: cfg.color,
        fontSize: "0.72rem",
        fontFamily: "'IBM Plex Mono', monospace",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.icon}
      {cfg.label}
    </Box>
  );
}

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

const selectSx = {
  background: "#f8fafc",
  color: "#0f172a",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: "0.8rem",
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
  "& .MuiSvgIcon-root": { color: "#94a3b8" },
};

const filterOptions = createFilterOptions<RepoOption>();

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  accounts: Account[];
  selectedAccount: Account | null;
  onAccountChange: (account: Account) => void;
  repos: Repo[];
  selectedRepo: RepoOption | null;
  onRepoChange: (repo: RepoOption | null) => void;
  templateStatus: TemplateStatus;
  templateName: string | null;
  defaultTemplateRepo: string;
  isPrivate: boolean;
  onIsPrivateChange: (v: boolean) => void;
  includeAllBranch: boolean;
  onIncludeAllBranchChange: (v: boolean) => void;
  cloning: boolean;
  cloneError: string | null;
  onClone: () => void;
  branches: Branch[];
  branchesLoading: boolean;
  sourceBranch: string;
  onSourceBranchChange: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  onCreateBranch: (target: string) => void;
  createEnvs: boolean;
  onCreateEnvsChange: (v: boolean) => void;
  cloneEnvWarning: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RepoCard({
  accounts,
  selectedAccount,
  onAccountChange,
  repos,
  selectedRepo,
  onRepoChange,
  templateStatus,
  templateName,
  defaultTemplateRepo,
  isPrivate,
  onIsPrivateChange,
  includeAllBranch,
  onIncludeAllBranchChange,
  cloning,
  cloneError,
  onClone,
  branches,
  branchesLoading,
  sourceBranch,
  onSourceBranchChange,
  creatingBranch,
  createBranchError,
  onCreateBranch,
  createEnvs,
  onCreateEnvsChange,
  cloneEnvWarning,
}: Props) {
  const isNewRepo = selectedRepo?.isNew ?? false;
  const isCloneRepo = templateStatus === "ready";
  const repoOptions: RepoOption[] = repos.map((r) => ({ id: r.id, name: r.name }));

  const missingEnvBranches = VALID_ENV_NAMES.filter((v) => !branches.some((b) => b.name.toLowerCase() === v.toLowerCase()));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* ── Selectors row ── */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Org selector */}
        <Select
          size="small"
          value={selectedAccount ? String(selectedAccount.id) : ""}
          onChange={(e) => {
            const acc = accounts.find((a) => String(a.id) === e.target.value);
            if (acc) onAccountChange(acc);
          }}
          displayEmpty
          sx={{ minWidth: 180, ...selectSx }}
        >
          {accounts.map((acc) => (
            <MenuItem key={acc.id} value={String(acc.id)} sx={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.82rem", color: "#0f172a" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {acc.type === "User" ? (
                  <PersonIcon sx={{ fontSize: 16, color: "#64748b" }} />
                ) : (
                  <BusinessIcon sx={{ fontSize: 16, color: "#64748b" }} />
                )}
                {acc.login}
              </Box>
            </MenuItem>
          ))}
        </Select>

        {/* Repo autocomplete */}
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Autocomplete
            value={selectedRepo}
            onChange={(_, newVal) => {
              if (typeof newVal === "string") return;
              onRepoChange(newVal);
            }}
            filterOptions={(options, params) => {
              const filtered = filterOptions(options, params);
              if (params.inputValue && !options.find((o) => o.name === params.inputValue)) {
                filtered.push({ id: `new-${params.inputValue}`, name: params.inputValue, isNew: true });
              }
              return filtered;
            }}
            options={repoOptions}
            getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
            isOptionEqualToValue={(o, v) => o.name === v.name}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.82rem" }}>
                {option.isNew ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#2563eb" }}>
                    <AddIcon sx={{ fontSize: 16 }} />
                    Clone as &ldquo;{option.name}&rdquo;
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#0f172a" }}>
                    <Box sx={{ fontSize: 12, color: "#94a3b8" }}>▪</Box>
                    {option.name}
                  </Box>
                )}
              </Box>
            )}
            renderInput={(params) => <TextField {...params} placeholder="Select or type repo name..." size="small" sx={inputSx} />}
            size="small"
          />
        </Box>

        {/* Template status badge */}
        {selectedRepo && !isNewRepo && (
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <TemplateBadge status={templateStatus} />
          </Box>
        )}
      </Box>

      {/* Template name */}
      {templateName && !isNewRepo && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>template:</Typography>
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: "4px",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              fontSize: "0.68rem",
              fontFamily: "'IBM Plex Mono', monospace",
              color: "#64748b",
            }}
          >
            {templateName}
          </Box>
        </Box>
      )}

      {/* Not a clone warning */}
      {selectedRepo && !isNewRepo && templateStatus === "not_clone" && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1.5, borderRadius: "8px", background: "#fff7ed", border: "1px solid #fed7aa" }}>
          <WarningAmberIcon sx={{ fontSize: 16, color: "#ea580c", flexShrink: 0 }} />
          <Typography sx={{ fontSize: "0.78rem", color: "#ea580c" }}>
            This repo is not a clone of the template. Only repos cloned from{" "}
            <Box component="span" sx={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
              {defaultTemplateRepo}
            </Box>{" "}
            can be used.
          </Typography>
        </Box>
      )}

      {/* ── Clone panel ── */}
      <Collapse in={isNewRepo} sx={{ display: isNewRepo ? "block" : "none" }}>
        <Box sx={{ p: 2.5, border: "1px solid #bfdbfe", borderRadius: "10px", background: "#eff6ff" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
            <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>Clone from template</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "#2563eb", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
              {defaultTemplateRepo}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 4, mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={isPrivate}
                  onChange={(e) => onIsPrivateChange(e.target.checked)}
                  size="small"
                  sx={{ "& .Mui-checked + .MuiSwitch-track": { background: "#93c5fd" } }}
                />
              }
              label={<Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>Private</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={includeAllBranch}
                  onChange={(e) => onIncludeAllBranchChange(e.target.checked)}
                  size="small"
                  sx={{ "& .Mui-checked + .MuiSwitch-track": { background: "#93c5fd" } }}
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>Clone all branches</Typography>
                  <Tooltip title="When enabled, all branches from the template will be copied. Otherwise only the default branch is cloned.">
                    <InfoOutlinedIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                  </Tooltip>
                </Box>
              }
            />

            <FormControlLabel
              control={
                <Switch
                  checked={createEnvs}
                  onChange={(e) => onCreateEnvsChange(e.target.checked)}
                  size="small"
                  sx={{ "& .Mui-checked + .MuiSwitch-track": { background: "#93c5fd" } }}
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>
                    Create environments
                  </Typography>
                  <Tooltip title="Automatically creates PROD and TEST GitHub environments in the new repo.">
                    <InfoOutlinedIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                  </Tooltip>
                </Box>
              }
            />
          </Box>

          {cloneError && (
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
              <ErrorOutlineIcon sx={{ fontSize: 15, color: "#ef4444" }} />
              <Typography sx={{ fontSize: "0.75rem", color: "#ef4444" }}>{cloneError}</Typography>
            </Box>
          )}
          {cloneEnvWarning && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                p: 1.25,
                borderRadius: "6px",
                background: "#fff7ed",
                border: "1px solid #fed7aa",
              }}
            >
              <WarningAmberIcon sx={{ fontSize: 15, color: "#ea580c" }} />
              <Typography sx={{ fontSize: "0.75rem", color: "#ea580c" }}>{cloneEnvWarning}</Typography>
            </Box>
          )}
          <Button
            onClick={onClone}
            disabled={cloning}
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
            {cloning ? (
              <>
                <CircularProgress size={12} sx={{ mr: 1, color: "#93c5fd" }} />
                Cloning...
              </>
            ) : (
              "Clone Repository"
            )}
          </Button>
        </Box>
      </Collapse>

      {/* ── Create Branch — shown only for confirmed clone repos with missing env branches ── */}
      <Collapse
        in={!isNewRepo && isCloneRepo && !branchesLoading && missingEnvBranches.length > 0}
        sx={{ display: !isNewRepo && isCloneRepo && !branchesLoading && missingEnvBranches.length > 0 ? "block" : "none" }}
      >
        <Box sx={{ p: 2.5, border: "1px solid #bfdbfe", borderRadius: "10px", background: "#eff6ff" }}>
          <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace", mb: 2 }}>Create Branch</Typography>

          {/* Single row: source selector + create buttons */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            {/* Source branch — hidden if only one branch exists */}
            {branches.length > 1 && (
              <>
                <Typography sx={{ fontSize: "0.72rem", color: "#64748b", fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>from:</Typography>
                <Select
                  size="small"
                  value={sourceBranch}
                  onChange={(e) => onSourceBranchChange(e.target.value)}
                  sx={{ mr: 3, minWidth: 140, ...selectSx }}
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
              </>
            )}
            {/* Create buttons — one per missing env */}
            {missingEnvBranches.map((envName) => (
              <Button
                key={envName}
                onClick={() => onCreateBranch(envName)}
                disabled={creatingBranch || !sourceBranch}
                variant="contained"
                size="small"
                startIcon={creatingBranch ? <CircularProgress size={12} sx={{ color: "#93c5fd" }} /> : <AddIcon />}
                sx={{
                  background: "#2563eb",
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "0.8rem",
                  textTransform: "none",
                  py: 0.75,
                  px: 2,
                  "&:hover": { background: "#1d4ed8" },
                  "&.Mui-disabled": { background: "#bfdbfe", color: "#93c5fd" },
                }}
              >
                {envName}
              </Button>
            ))}
          </Box>

          {createBranchError && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mt: 1.5,
                p: 1.25,
                borderRadius: "6px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
              }}
            >
              <ErrorOutlineIcon sx={{ fontSize: 15, color: "#ef4444" }} />
              <Typography sx={{ fontSize: "0.75rem", color: "#ef4444" }}>{createBranchError}</Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
