import { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { createFilterOptions } from "@mui/material/Autocomplete";
import AddIcon from "@mui/icons-material/Add";
import BusinessIcon from "@mui/icons-material/Business";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PersonIcon from "@mui/icons-material/Person";
// import SettingsIcon from "@mui/icons-material/Settings";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import PlanView from "./planView";
import { parse } from "dotenv";

// ─── Constants ───────────────────────────────────────────────────────────────

const url = import.meta.env.VITE_API_URL;

const REQUIRED_ENV_KEYS = ["NAME", "DNS", "SUBSCRIPTION_ID"];

const STATUS_CONFIG = {
  deployed: { color: "#22c55e", label: "Deployed" },
  success: { color: "#f97316", label: "Ready to deploy" },
  failed: { color: "#ef4444", label: "Failed" },
  pending: { color: "#94a3b8", label: "Not yet executed" },
} as const;

const STAGE_LABEL: Record<string, string> = {
  c01: "c01subscription",
  c02: "c02globalGroups",
  c05: "c05rootrg",
};

const REPO_STATUS_CONFIG = {
  ready: {
    label: "Ready",
    color: "#16a34a",
    bg: "#f0fdf4",
    icon: <CheckCircleIcon sx={{ fontSize: 14 }} />,
  },
  not_clone: {
    label: "Not a Clone of Template",
    color: "#ea580c",
    bg: "#fff7ed",
    icon: <WarningAmberIcon sx={{ fontSize: 14 }} />,
  },
  checking: {
    label: "Checking...",
    color: "#64748b",
    bg: "#f1f5f9",
    icon: <CircularProgress size={12} sx={{ color: "#64748b" }} />,
  },
} as const;

const PIPELINES: Record<string, PipelineConfig> = {
  corpSetup: {
    workflowId: "planChanges.yml",
    label: "Corp Setup",
    stages: [
      { key: "c01", label: "c01subscription" },
      { key: "c02", label: "c02globalGroups" },
      { key: "c05", label: "c05rootrg" },
      { key: "c20", label: "c20awsentrasso" },
      { key: "c21", label: "c21awsentrassoP2" },
      { key: "c25", label: "c25cloudfront" },
    ],
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

type Account = {
  login: string;
  type: "User" | "Organization";
  id: number;
};

type Repo = {
  id: number;
  name: string;
};

type RepoOption = {
  id: number | string;
  name: string;
  isNew?: boolean;
};

type Stage = {
  stage: string;
  status: keyof typeof STATUS_CONFIG;
  planPath?: string;
  planJsonId?: string;
  planJsonUrl?: string;
  runId?: string;
};

type StageDefinition = {
  key: string;
  label: string;
};

type PipelineConfig = {
  workflowId: string;
  label: string;
  stages: StageDefinition[];
};

type EnvEntry = { key: string; value: string };

// ─── API helpers ─────────────────────────────────────────────────────────────

async function fetchOrgList(): Promise<Account[]> {
  const res = await fetch(`${url}/getOrgs`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch orgs: ${res.status}`);
  const data = await res.json();
  return [
    { login: data.user.login, type: "User", id: data.user.id },
    ...data.orgList.map((o) => ({ login: o.login, type: "Organization", id: o.id })),
  ];
}

async function fetchRepos(account: Account): Promise<Repo[]> {
  const params = new URLSearchParams({ owner: account.login, type: account.type });
  const res = await fetch(`${url}/getRepos?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch repos: ${res.status}`);
  const data = await res.json();
  return data.repoList || [];
}

async function checkTemplate(account: Account, repo: string) {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/checkTemplate?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to check template: ${res.status}`);
  return res.json(); // { isTemplate: boolean, templateName: string }
}

async function fetchStatus(account: Account, repo: string) {
  const params = new URLSearchParams({ path: "corpSetup/deploymentChangeset.json", owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/getContents?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch status: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.content);
}

async function fetchEnv(account: Account, repo: string): Promise<Record<string, string>> {
  const params = new URLSearchParams({ path: "corpSetup/corp.env", owner: account.login, repo, type: account.type });
  const res = await fetch(`${url}/getContents?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch env: ${res.status}`);
  const data = await res.json();
  return parse(data.content);
}

async function saveEnv(account: Account, repo: string, env: Record<string, string>) {
  // TODO: implement save env to repo
  console.log("Saving env", env);
}

async function generateRepo(account: Account, targetName: string, isPrivate: boolean, includeAllBranch: boolean) {
  const res = await fetch(`${url}/generateRepo`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({ includeAllBranch, isPrivate, owner: account.login, type: account.type, repo: targetName }),
  });
  if (!res.ok) throw new Error(`Failed to clone repo: ${res.status}`);
  const data = await res.json();
  return data.data;
}

async function triggerWorkflow(account: Account, repo: string, env: Record<string, string>) {
  return fetch(`${url}/triggerActions`, {
    credentials: "include",
    method: "POST",
    body: JSON.stringify({ env: JSON.stringify(env), repo, owner: account.login, type: account.type, workflow_id: "planChanges.yml" }),
  });
}

// function sortStages(data): Stage[] {
//   return [...data].sort((a, b) => parseInt(a.stage.replace(/\D/g, ""), 10) - parseInt(b.stage.replace(/\D/g, ""), 10));
// }

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: keyof typeof REPO_STATUS_CONFIG }) {
  const cfg = REPO_STATUS_CONFIG[status];
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
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {cfg.icon}
      {cfg.label}
    </Box>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, my: 3 }}>
      <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(to right, #f1f5f9, #cbd5e1)" }} />
      <Typography
        sx={{ fontSize: "0.65rem", letterSpacing: "0.15em", color: "#94a3b8", textTransform: "uppercase", fontFamily: "'IBM Plex Mono', monospace" }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: "1px", background: "linear-gradient(to left, #f1f5f9, #cbd5e1)" }} />
    </Box>
  );
}

// ─── Env Modal ───────────────────────────────────────────────────────────────

function EnvModal({
  open,
  onClose,
  envEntries,
  onChange,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  envEntries: EnvEntry[];
  onChange: (entries: EnvEntry[]) => void;
  onSave: () => void;
}) {
  const missingRequired = REQUIRED_ENV_KEYS.filter((k) => !envEntries.find((e) => e.key === k && e.value.trim()));

  const updateEntry = (idx: number, field: "key" | "value", val: string) => {
    const next = [...envEntries];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };

  const removeEntry = (idx: number) => {
    const entry = envEntries[idx];
    if (REQUIRED_ENV_KEYS.includes(entry.key)) return;
    onChange(envEntries.filter((_, i) => i !== idx));
  };

  const addEntry = () => onChange([...envEntries, { key: "", value: "" }]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          color: "#0f172a",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Box>
          <Typography sx={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
            Environment Config
          </Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "#64748b", mt: 0.25 }}>Configure variables for workflow execution</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: "#94a3b8", "&:hover": { color: "#475569" } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Divider sx={{ borderColor: "#f1f5f9" }} />

      <DialogContent sx={{ pt: 2.5 }}>
        {missingRequired.length > 0 && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 2,
              p: 1.5,
              borderRadius: "8px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
            }}
          >
            <WarningAmberIcon sx={{ fontSize: 16, color: "#f97316", flexShrink: 0 }} />
            <Typography sx={{ fontSize: "0.75rem", color: "#f97316" }}>Required fields missing: {missingRequired.join(", ")}</Typography>
          </Box>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {envEntries.map((entry, idx) => {
            const isRequired = REQUIRED_ENV_KEYS.includes(entry.key);
            return (
              <Box key={idx} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <TextField
                  size="small"
                  placeholder="KEY"
                  value={entry.key}
                  onChange={(e) => updateEntry(idx, "key", e.target.value.toUpperCase())}
                  disabled={isRequired}
                  sx={{ flex: 1, ...darkInputSx }}
                  InputProps={{
                    endAdornment: isRequired && (
                      <Tooltip title="Required field">
                        <InfoOutlinedIcon sx={{ fontSize: 14, color: "#475569" }} />
                      </Tooltip>
                    ),
                  }}
                />
                <TextField
                  size="small"
                  placeholder="value"
                  value={entry.value}
                  onChange={(e) => updateEntry(idx, "value", e.target.value)}
                  sx={{ flex: 2, ...darkInputSx }}
                />
                <IconButton
                  size="small"
                  onClick={() => removeEntry(idx)}
                  disabled={isRequired}
                  sx={{ color: isRequired ? "#e2e8f0" : "#94a3b8", "&:hover": { color: "#ef4444" } }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            );
          })}
        </Box>

        <Button
          startIcon={<AddIcon />}
          onClick={addEntry}
          size="small"
          sx={{ mt: 2, color: "#94a3b8", fontSize: "0.75rem", textTransform: "none", "&:hover": { color: "#475569" } }}
        >
          Add variable
        </Button>

        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, mt: 3 }}>
          <Button onClick={onClose} size="small" sx={{ color: "#64748b", textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            variant="contained"
            size="small"
            sx={{
              background: "#2563eb",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: "0.8rem",
              "&:hover": { background: "#1d4ed8" },
            }}
          >
            Save
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── Shared input style ───────────────────────────────────────────────────────

const darkInputSx = {
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
  "& .MuiInputBase-input.Mui-disabled": { WebkitTextFillColor: "#cbd5e1" },
};

// ─── Main App ─────────────────────────────────────────────────────────────────

const filterOptions = createFilterOptions<RepoOption>();

export default function App() {
  const defaultTemplateRepo = "ZenMe-AU/ZBCorpArchitecture";
  // Loader
  const [authLoading, setAuthLoading] = useState(true);
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null);

  // Auth
  const [user, setUser] = useState<{ login: string } | null>(null); // TODO: fetch from /verify

  // Accounts & repos
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repoCache, setRepoCache] = useState<Record<string, Repo[]>>({});
  const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(null);

  // Template info
  const [templateStatus, setTemplateStatus] = useState<"checking" | "ready" | "not_clone">("not_clone");
  const [templateName, setTemplateName] = useState<string | null>(null);

  // Clone
  const [isPrivate, setIsPrivate] = useState(true);
  const [includeAllBranch, setIncludeAllBranch] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  // Stages
  const [stages, setStages] = useState<Stage[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [stagesLoading, setStagesLoading] = useState(false);

  // Pipeline
  const [statusFileFound, setStatusFileFound] = useState<boolean>(true);
  const [selectedPipeline, setSelectedPipeline] = useState<string>("corpSetup");
  const pipeline = PIPELINES[selectedPipeline];

  // Workflow
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [lastRunTime, setLastRunTime] = useState<number | null>(null);

  // Env
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(REQUIRED_ENV_KEYS.map((k) => ({ key: k, value: "" })));
  const [envModalOpen, setEnvModalOpen] = useState(false);

  const isCloneRepo = templateStatus === "ready";
  const isNewRepo = selectedRepo?.isNew ?? false;
  const missingEnv = REQUIRED_ENV_KEYS.filter((k) => !envEntries.find((e) => e.key === k && e.value.trim()));

  // Load orgs on mount
  useEffect(() => {
    fetchOrgList()
      .then((data) => {
        const userAccount = data.find((a) => a.type === "User");
        setUser(userAccount ? { login: userAccount.login } : null); // TODO: improve after implementing /verify
        setAccounts(data);
        setSelectedAccount(data[0] || null);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  // Load repos when account changes
  useEffect(() => {
    if (!selectedAccount) return;
    const key = String(selectedAccount.id);
    if (repoCache[key]) {
      setRepos(repoCache[key]);
      return;
    }
    fetchRepos(selectedAccount)
      .then((list) => {
        setRepos(list);
        setRepoCache((prev) => ({ ...prev, [key]: list }));
      })
      .catch(console.error);
    setSelectedRepo(null);
    setStages([]);
    setTemplateName(null);
  }, [selectedAccount]);

  // Check template + fetch status + env when repo changes
  useEffect(() => {
    if (!selectedAccount || !selectedRepo || selectedRepo.isNew) return;

    setTemplateStatus("checking");
    setTemplateName(null);
    setStages([]);

    checkTemplate(selectedAccount, selectedRepo.name)
      .then((data) => {
        setTemplateStatus(data.isTemplate ? "ready" : "not_clone");
        setTemplateName(data.templateName || null);
        if (data.isTemplate) {
          loadStages();
          fetchEnv(selectedAccount, selectedRepo.name)
            .then((obj) => setEnvEntries(Object.entries(obj).map(([key, value]) => ({ key, value: value as string }))))
            .catch(console.error);
        }
      })
      .catch(() => setTemplateStatus("not_clone"));
  }, [selectedRepo, selectedAccount]);

  function loadStages() {
    if (!selectedAccount || !selectedRepo) return;
    setStagesLoading(true);
    fetchStatus(selectedAccount, selectedRepo.name)
      .then((data) => {
        const fetched = data.stages || [];
        const merged = pipeline.stages.map(({ key }) => {
          const found = fetched.find((s: any) => s.stage === key);
          return found ?? { stage: key, status: "failed" as const };
        });
        setStages(merged);
        setStatusFileFound(true);
      })
      .catch(() => {
        setStages(pipeline.stages.map(({ key }) => ({ stage: key, status: "pending" as const })));
        setStatusFileFound(false);
      })
      .finally(() => setStagesLoading(false));
  }

  async function handleClone() {
    if (!selectedAccount || !selectedRepo) return;
    const name = selectedRepo.name;

    // Check duplicate
    if (repos.find((r) => r.name === name)) {
      setCloneError(`Repository "${name}" already exists`);
      return;
    }

    setCloning(true);
    setCloneError(null);
    try {
      const newRepo: Repo = await generateRepo(selectedAccount, name, isPrivate, includeAllBranch);
      const updated = [...repos, newRepo];
      setRepos(updated);
      setRepoCache((prev) => ({ ...prev, [String(selectedAccount.id)]: updated }));
      setSelectedRepo({ id: newRepo.id, name: newRepo.name });
    } catch (e) {
      setCloneError(e.message || "Clone failed");
    } finally {
      setCloning(false);
    }
  }

  async function handleRunStatusUpdate() {
    if (!selectedAccount || !selectedRepo || !isCloneRepo) return;
    setRunning(true);
    setCountdown(180);
    setLastRunTime(Date.now());

    try {
      await triggerWorkflow(selectedAccount, selectedRepo.name, Object.fromEntries(envEntries.map((e) => [e.key, e.value])));
    } catch {
      setRunning(false);
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          loadStages();
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSaveEnv() {
    if (!selectedAccount || !selectedRepo) return;
    try {
      await saveEnv(selectedAccount, selectedRepo.name, Object.fromEntries(envEntries.map((e) => [e.key, e.value])));
      setEnvModalOpen(false);
    } catch (e) {
      console.error(e);
    }
  }

  const repoOptions: RepoOption[] = repos.map((r) => ({ id: r.id, name: r.name }));

  return (
    <>
      {redirecting && (
        <Box
          sx={{
            position: "fixed",
            inset: 0,
            background: "rgba(248,250,252,0.85)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <CircularProgress size={28} sx={{ color: "#2563eb" }} />
          <Typography sx={{ fontSize: "0.85rem", color: "#64748b", fontFamily: "'IBM Plex Mono', monospace" }}>
            {redirecting === "login" ? "Redirecting to GitHub..." : "Logging out..."}
          </Typography>
        </Box>
      )}
      <Box sx={{ minHeight: "100vh", background: "#f8fafc", color: "#0f172a", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {/* ── Top Nav ── */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 4,
            py: 1.75,
            background: "#ffffff",
            borderBottom: "1px solid #e2e8f0",
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "7px",
                background: "linear-gradient(135deg, #2563eb, #7c3aed)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.7rem",
                fontWeight: 800,
                color: "#fff",
                fontFamily: "'IBM Plex Mono', monospace",
              }}
            >
              ZB
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", letterSpacing: "-0.01em" }}>Corp Setup</Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {/* Settings with Install GitHub App inside — placeholder
            <Tooltip title="Settings">
              <IconButton size="small" sx={{ color: "#94a3b8", "&:hover": { color: "#475569" } }}>
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>*/}

            {/* Login / User */}
            {user ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
                <Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>{user.login}</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setRedirecting("logout");
                    window.location.href = `${url}/logout?returnUrl=${encodeURIComponent(window.location.href)}`;
                  }}
                  sx={{
                    borderColor: "#e2e8f0",
                    color: "#94a3b8",
                    fontSize: "0.78rem",
                    textTransform: "none",
                    fontFamily: "'IBM Plex Mono', monospace",
                    py: 0.5,
                    "&:hover": { borderColor: "#fecaca", color: "#ef4444" },
                  }}
                >
                  Logout
                </Button>
              </Box>
            ) : (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setRedirecting("login");
                  window.location.href = `${url}/login?returnUrl=${encodeURIComponent(window.location.href)}`;
                }}
                sx={{
                  borderColor: "#e2e8f0",
                  color: "#475569",
                  fontSize: "0.78rem",
                  textTransform: "none",
                  fontFamily: "'IBM Plex Mono', monospace",
                  py: 0.5,
                  "&:hover": { borderColor: "#cbd5e1", color: "#0f172a" },
                }}
              >
                Login with GitHub
              </Button>
            )}
          </Box>
        </Box>

        {/* ── Main Content ── */}
        <Box sx={{ maxWidth: 900, mx: "auto", px: 4, py: 5 }}>
          {authLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2 }}>
              <CircularProgress size={16} sx={{ color: "#cbd5e1" }} />
              <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>Verifying access...</Typography>
            </Box>
          ) : !user ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 2 }}>
              <Typography sx={{ fontSize: "0.85rem", color: "#64748b" }}>Please login to continue.</Typography>
            </Box>
          ) : (
            <>
              {/* ── Section: Repo Selection ── */}
              <Typography
                sx={{
                  fontSize: "0.65rem",
                  letterSpacing: "0.15em",
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  fontFamily: "'IBM Plex Mono', monospace",
                  mb: 2,
                }}
              >
                Repository
              </Typography>

              <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
                {/* Org selector */}
                <Select
                  disabled={!user}
                  size="small"
                  value={selectedAccount?.id || ""}
                  onChange={(e) => {
                    const acc = accounts.find((a) => String(a.id) === String(e.target.value));
                    if (acc) setSelectedAccount(acc);
                  }}
                  displayEmpty
                  sx={{
                    minWidth: 180,
                    background: "#ffffff",
                    color: "#0f172a",
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: "0.82rem",
                    "& .MuiOutlinedInput-notchedOutline": { borderColor: "#e2e8f0" },
                    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
                    "& .MuiSvgIcon-root": { color: "#94a3b8" },
                  }}
                >
                  {accounts.map((acc) => (
                    <MenuItem
                      key={acc.id}
                      value={String(acc.id)}
                      sx={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.82rem", color: "#0f172a" }}
                    >
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

                {/* Repo autocomplete with new option */}
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Autocomplete
                    disabled={!user}
                    value={selectedRepo}
                    onChange={(_, newVal) => {
                      if (typeof newVal === "string") return;
                      setSelectedRepo(newVal);
                      setCloneError(null);
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
                            <Box sx={{ fontSize: 12, color: "#475569" }}>▪</Box>
                            {option.name}
                          </Box>
                        )}
                      </Box>
                    )}
                    renderInput={(params) => <TextField {...params} placeholder="Select or type repo name..." size="small" sx={darkInputSx} />}
                    freeSolo={false}
                    size="small"
                  />
                </Box>

                {/* Status badge */}
                {selectedRepo && !selectedRepo.isNew && (
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <StatusBadge status={templateStatus} />
                  </Box>
                )}
              </Box>

              {/* Template name info */}
              {templateName && !isNewRepo && (
                <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography sx={{ fontSize: "0.72rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>template:</Typography>
                  <Chip
                    label={templateName}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.68rem",
                      fontFamily: "'IBM Plex Mono', monospace",
                      background: "#f1f5f9",
                      color: "#64748b",
                      border: "1px solid #e2e8f0",
                    }}
                  />
                </Box>
              )}

              {/* Clone panel — shown only when new repo selected */}
              <Collapse in={isNewRepo}>
                <Box
                  sx={{
                    mt: 2.5,
                    p: 3,
                    border: "1px solid #bfdbfe",
                    borderRadius: "10px",
                    background: "#eff6ff",
                  }}
                >
                  <Typography sx={{ fontSize: "0.75rem", color: "#2563eb", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, mb: 2 }}>
                    Clone from template: {defaultTemplateRepo}
                  </Typography>

                  <Box sx={{ display: "flex", gap: 4, mb: 2 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={isPrivate}
                          onChange={(e) => setIsPrivate(e.target.checked)}
                          size="small"
                          sx={{ "& .MuiSwitch-thumb": { background: "#2563eb" }, "& .Mui-checked + .MuiSwitch-track": { background: "#93c5fd" } }}
                        />
                      }
                      label={
                        <Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>Private</Typography>
                      }
                    />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={includeAllBranch}
                          onChange={(e) => setIncludeAllBranch(e.target.checked)}
                          size="small"
                          sx={{ "& .MuiSwitch-thumb": { background: "#2563eb" }, "& .Mui-checked + .MuiSwitch-track": { background: "#93c5fd" } }}
                        />
                      }
                      label={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Typography sx={{ fontSize: "0.78rem", color: "#475569", fontFamily: "'IBM Plex Mono', monospace" }}>
                            Include all branches
                          </Typography>
                          <Tooltip title="When enabled, all branches from the template will be copied. Otherwise only the default branch is cloned.">
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

                  <Button
                    onClick={handleClone}
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
                      "&.Mui-disabled": { background: "#1e3a5f", color: "#475569" },
                    }}
                  >
                    {cloning ? (
                      <>
                        <CircularProgress size={12} sx={{ mr: 1, color: "#475569" }} />
                        Cloning...
                      </>
                    ) : (
                      "Clone Repository"
                    )}
                  </Button>
                </Box>
              </Collapse>

              {/* ── Section: Workflow (only for clone repos) ── */}
              <Collapse in={isCloneRepo}>
                <SectionDivider label="Workflow" />

                {/* Install GitHub App warning if not installed
                {selectedAccount && !selectedAccount.isInstalled && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      p: 2,
                      mb: 3,
                      borderRadius: "8px",
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <WarningAmberIcon sx={{ fontSize: 18, color: "#ea580c" }} />
                      <Typography sx={{ fontSize: "0.8rem", color: "#ea580c" }}>
                        GitHub App not installed on this account. Workflows will not trigger.
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      onClick={() => window.open("https://github.com/apps/zbdeployorgapp", "_blank")}
                      sx={{
                        color: "#ea580c",
                        borderColor: "#ea580c",
                        fontSize: "0.75rem",
                        textTransform: "none",
                        fontFamily: "'IBM Plex Mono', monospace",
                        border: "1px solid",
                        py: 0.5,
                        px: 1.5,
                        "&:hover": { background: "#fff7ed" },
                      }}
                    >
                      Install App
                    </Button>
                  </Box>
                )} */}

                {/* Action bar */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                  <Button
                    onClick={handleRunStatusUpdate}
                    disabled={running || missingEnv.length > 0}
                    variant="contained"
                    sx={{
                      background: running ? "#e2e8f0" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      color: running ? "#94a3b8" : "#fff",
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: "0.82rem",
                      textTransform: "none",
                      py: 1,
                      px: 2.5,
                      borderRadius: "8px",
                      boxShadow: running ? "none" : "0 2px 8px #2563eb33",
                      "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
                      "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1", boxShadow: "none" },
                    }}
                  >
                    {running ? (
                      <>
                        <CircularProgress size={13} sx={{ mr: 1, color: "#94a3b8" }} />
                        Running... {countdown >= 60 ? `${Math.ceil(countdown / 60)}m` : `${countdown}s`}
                      </>
                    ) : (
                      "Run Status Update"
                    )}
                  </Button>

                  {missingEnv.length > 0 && !running && (
                    <Tooltip title={`Missing required env vars: ${missingEnv.join(", ")}`}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "#ea580c", cursor: "default" }}>
                        <WarningAmberIcon sx={{ fontSize: 15 }} />
                        <Typography sx={{ fontSize: "0.72rem", fontFamily: "'IBM Plex Mono', monospace" }}>Env config required</Typography>
                      </Box>
                    </Tooltip>
                  )}

                  <Box sx={{ flex: 1 }} />

                  {lastRunTime && (
                    <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
                      last run {new Date(lastRunTime).toLocaleTimeString()}
                    </Typography>
                  )}

                  <Button
                    onClick={() => setEnvModalOpen(true)}
                    size="small"
                    variant="outlined"
                    sx={{
                      borderColor: "#e2e8f0",
                      color: "#64748b",
                      fontSize: "0.75rem",
                      textTransform: "none",
                      fontFamily: "'IBM Plex Mono', monospace",
                      "&:hover": { borderColor: "#cbd5e1", color: "#475569", background: "#f8fafc" },
                    }}
                  >
                    Env Config
                    {missingEnv.length > 0 && (
                      <Box
                        component="span"
                        sx={{ ml: 1, width: 8, height: 8, borderRadius: "50%", background: "#ea580c", display: "inline-block" }}
                      />
                    )}
                  </Button>

                  {/* Update / Delete — disabled, reserved for phase 2 */}
                  <Tooltip title="Coming soon: pull latest template changes into this repo">
                    <span>
                      <Button
                        disabled
                        size="small"
                        variant="outlined"
                        sx={{
                          borderColor: "#e2e8f0",
                          color: "#cbd5e1",
                          fontSize: "0.75rem",
                          textTransform: "none",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        Update Repo
                      </Button>
                    </span>
                  </Tooltip>

                  <Tooltip title="Coming soon: safely delete this repo after verifying it is a template clone">
                    <span>
                      <Button
                        disabled
                        size="small"
                        variant="outlined"
                        sx={{
                          borderColor: "#e2e8f0",
                          color: "#cbd5e1",
                          fontSize: "0.75rem",
                          textTransform: "none",
                          fontFamily: "'IBM Plex Mono', monospace",
                        }}
                      >
                        Delete Repo
                      </Button>
                    </span>
                  </Tooltip>
                </Box>

                {/* ── Status Timeline ── */}
                <Box sx={{ mt: 4 }}>
                  {stagesLoading ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 4 }}>
                      <CircularProgress size={16} sx={{ color: "#cbd5e1" }} />
                      <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
                        Loading stages...
                      </Typography>
                    </Box>
                  ) : stages.length === 0 ? (
                    <Box sx={{ py: 4, textAlign: "center" }}>
                      <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
                        No status file found. Run a status update to generate the deployment changeset.
                      </Typography>
                    </Box>
                  ) : (
                    <>
                      {!statusFileFound && (
                        <Box sx={{ mb: 3, p: 2, borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                          <Typography sx={{ fontSize: "0.78rem", color: "#94a3b8", fontFamily: "'IBM Plex Mono', monospace" }}>
                            No status file found. Run a status update to generate the deployment changeset.
                          </Typography>
                        </Box>
                      )}
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {stages.map((item, index) => {
                          const cfg = STATUS_CONFIG[item.status] || { color: "#64748b", label: item.status };
                          const isExpanded = expanded[item.stage];
                          const hasDetails = !!item.planPath;

                          return (
                            <Box key={item.stage} sx={{ display: "flex", gap: 3 }}>
                              {/* Timeline spine */}
                              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", pt: 0.75 }}>
                                <Box
                                  sx={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    background: cfg.color,
                                    boxShadow: `0 0 8px ${cfg.color}55`,
                                    flexShrink: 0,
                                  }}
                                />
                                {index < stages.length - 1 && <Box sx={{ flex: 1, width: 1, background: "#e2e8f0", minHeight: 32, mt: 0.5 }} />}
                              </Box>

                              {/* Card */}
                              <Box
                                sx={{
                                  flex: 1,
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                  background: "#ffffff",
                                  overflow: "hidden",
                                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    px: 2.5,
                                    py: 1.75,
                                  }}
                                >
                                  <Box>
                                    <Typography
                                      sx={{ fontSize: "0.82rem", fontWeight: 600, color: "#0f172a", fontFamily: "'IBM Plex Mono', monospace" }}
                                    >
                                      {pipeline.stages.find((s) => s.key === item.stage)?.label || item.stage}
                                    </Typography>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
                                      <Typography sx={{ fontSize: "0.72rem", color: cfg.color, fontFamily: "'IBM Plex Mono', monospace" }}>
                                        {cfg.label}
                                      </Typography>
                                    </Box>
                                  </Box>

                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    {item.status === "success" && (
                                      <Button
                                        size="small"
                                        variant="contained"
                                        onClick={() => console.log("Deploy", item.stage, item.runId)}
                                        sx={{
                                          background: "#f97316",
                                          fontSize: "0.72rem",
                                          textTransform: "none",
                                          fontFamily: "'IBM Plex Mono', monospace",
                                          py: 0.5,
                                          px: 1.5,
                                          "&:hover": { background: "#ea6c0a" },
                                        }}
                                      >
                                        Deploy
                                      </Button>
                                    )}
                                    {hasDetails && (
                                      <IconButton
                                        size="small"
                                        onClick={() => setExpanded((prev) => ({ ...prev, [item.stage]: !prev[item.stage] }))}
                                        sx={{ color: "#cbd5e1", "&:hover": { color: "#94a3b8" } }}
                                      >
                                        {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                      </IconButton>
                                    )}
                                  </Box>
                                </Box>

                                {/* Plan details */}
                                <Collapse in={isExpanded}>
                                  <Divider sx={{ borderColor: "#f1f5f9" }} />
                                  <Box sx={{ p: 2 }}>
                                    {isExpanded && item.status === "success" && item.planJsonId && item.planJsonUrl !== "" && (
                                      <PlanView stage={item.stage} path={item.planJsonId} account={selectedAccount} repo={selectedRepo?.name || ""} />
                                    )}
                                  </Box>
                                </Collapse>
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                    </>
                  )}
                </Box>
              </Collapse>
            </>
          )}
        </Box>

        {/* ── Env Modal ── */}
        <EnvModal
          open={envModalOpen}
          onClose={() => setEnvModalOpen(false)}
          envEntries={envEntries}
          onChange={setEnvEntries}
          onSave={handleSaveEnv}
        />
      </Box>
    </>
  );
}
