import { useState, useEffect, useRef } from "react";
import { Box, Button, Checkbox, CircularProgress, Collapse, FormControlLabel, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CheckIcon from "@mui/icons-material/Check";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, GhEnv } from "../types";
import type { useAwsSetup } from "../hooks/useAwsSetup";
import { AWS_VARIABLE_KEYS } from "../logic/variables";
import { CLOUD_DOCS } from "../config/docsConfig";
import VariableEditor from "./VariableEditor";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const labelSx = { fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", ...mono };

type Props = ReturnType<typeof useAwsSetup> & {
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  disabled: boolean;
  onComplete: (done: boolean) => void;
  githubUrl?: string;
};

export default function AwsCfnCard({
  accessKeyId,
  setAccessKeyId,
  secretAccessKey,
  setSecretAccessKey,
  roleName,
  setRoleName,
  setEnvironments,
  createOidcProvider,
  setCreateOidcProvider,
  loading,
  roleArn,
  wasUpdated,
  error,
  canCreate,
  create,
  account,
  repoName,
  selectedEnv,
  disabled,
  onComplete,
  githubUrl,
}: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [varExpanded, setVarExpanded] = useState(false);
  const [loadedVars, setLoadedVars] = useState<Record<string, string> | null>(null);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const [bannerState, setBannerState] = useState<"none" | "saved" | "no-changes" | "error">("none");
  const prevRoleArnRef = useRef<string | null>(null);
  const prefilledRoleRef = useRef(false);

  const varHasAny = !!loadedVars && Object.keys(loadedVars).length > 0;

  // Create action also dismisses the banner.
  const handleCreate = () => { setBannerState("none"); create(); };

  // Keep environments in sync with the selected env from parent.
  useEffect(() => {
    if (selectedEnv?.name) setEnvironments([selectedEnv.name]);
  }, [selectedEnv?.name, setEnvironments]);

  // Reset prefill guard when the target env changes.
  useEffect(() => {
    prefilledRoleRef.current = false;
  }, [selectedEnv?.name]);

  // (6) Prefill IAM role name from the saved AWS_ROLE_ARN (arn:…:role/<name>).
  useEffect(() => {
    if (prefilledRoleRef.current || roleArn) return;
    const savedArn = loadedVars?.[AWS_VARIABLE_KEYS[0]];
    const name = savedArn?.split("/").pop();
    if (name) {
      prefilledRoleRef.current = true;
      setRoleName(name);
    }
  }, [loadedVars, roleArn, setRoleName]);

  // Trigger auto-save + expand once when roleArn first becomes available.
  useEffect(() => {
    if (roleArn && !prevRoleArnRef.current) {
      const t = setTimeout(() => {
        setAutoSaveCounter((c) => c + 1);
        setVarExpanded(true);
      }, 0);
      prevRoleArnRef.current = roleArn;
      return () => clearTimeout(t);
    }
    prevRoleArnRef.current = roleArn ?? null;
  }, [roleArn]);

  const populate = roleArn ? { [AWS_VARIABLE_KEYS[0]]: roleArn } : undefined;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* ── Result banner (shown after create+auto-save completes) ── */}
      {bannerState !== "none" && (
        <Box sx={{
          display: "flex", alignItems: "center", gap: 1,
          background: bannerState === "error" ? "#fef9c3" : "#f0fdf4",
          border: `1px solid ${bannerState === "error" ? "#fde047" : "#bbf7d0"}`,
          borderRadius: "8px", px: 1.5, py: 1,
        }}>
          {bannerState === "error"
            ? <WarningAmberIcon sx={{ fontSize: 16, color: "#d97706" }} />
            : <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#16a34a" }} />
          }
          <Typography sx={{ fontSize: "0.75rem", color: bannerState === "error" ? "#713f12" : "#15803d" }}>
            {bannerState === "saved" && "Connection details saved."}
            {bannerState === "no-changes" && "Connection details saved — no changes needed."}
            {bannerState === "error" && "Some connection details failed to save — check below."}
          </Typography>
        </Box>
      )}

      {/* ── Create section ── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
          Provide temporary IAM credentials and we'll create an IAM role GitHub can assume via OIDC, then save the connection details automatically.
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography sx={{ fontSize: "0.7rem", color: "#94a3b8" }}>No AWS account?</Typography>
          <Box
            component="a"
            href={CLOUD_DOCS.aws.createAccount}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "#64748b", textDecoration: "none", "&:hover": { color: "#2563eb" } }}
          >
            <Typography sx={{ fontSize: "0.7rem" }}>Create a free one</Typography>
            <OpenInNewIcon sx={{ fontSize: 11 }} />
          </Box>
        </Box>

        {/* Bootstrap credentials */}
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
            <Typography sx={labelSx}>Credentials</Typography>
            <Box
              component="a"
              href={CLOUD_DOCS.aws.bootstrapCredentials}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, color: "#2563eb", textDecoration: "none", fontSize: "0.68rem", ...mono, "&:hover": { textDecoration: "underline" } }}
            >
              Set-up guide
              <OpenInNewIcon sx={{ fontSize: 11 }} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", mb: 1.5, lineHeight: 1.6 }}>
            Generate access keys from your AWS account's Security credentials. Can be deleted after setup.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <TextField
              size="small"
              label="Access Key ID"
              value={accessKeyId}
              onChange={(e) => setAccessKeyId(e.target.value)}
              placeholder="AKIA..."
              sx={{ maxWidth: 340 }}
              InputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
            />
            <TextField
              size="small"
              label="Secret Access Key"
              type={showSecret ? "text" : "password"}
              value={secretAccessKey}
              onChange={(e) => setSecretAccessKey(e.target.value)}
              sx={{ maxWidth: 340 }}
              InputProps={{
                style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowSecret((v) => !v)} edge="end">
                      {showSecret ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Box>
        </Box>

        {/* Role name */}
        <Box>
          <Typography sx={{ ...labelSx, mb: 0.75 }}>IAM role name</Typography>
          <TextField
            size="small"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            sx={{ minWidth: 280 }}
            inputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
          />
        </Box>

        {/* OIDC provider toggle */}
        <FormControlLabel
          control={
            <Checkbox
              checked={createOidcProvider}
              onChange={(e) => setCreateOidcProvider(e.target.checked)}
              size="small"
              sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#2563eb" }, py: 0.5 }}
            />
          }
          label={
            <Typography sx={{ fontSize: "0.75rem", color: "#475569" }}>
              Create GitHub OIDC provider
              <Box component="span" sx={{ color: "#94a3b8", fontSize: "0.68rem", ml: 0.75 }}>
                (check if not already set up in this AWS account)
              </Box>
            </Typography>
          }
        />

        {/* Create button + overwrite warning */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={disabled || !canCreate || loading}
            startIcon={loading ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : roleArn ? <CheckIcon sx={{ fontSize: 16 }} /> : undefined}
            sx={{
              background: roleArn ? "#16a34a" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
              textTransform: "none",
              ...mono,
              fontSize: "0.85rem",
              py: 1,
              px: 2.5,
              borderRadius: "8px",
              boxShadow: roleArn ? "0 2px 8px #16a34a33" : "0 2px 8px #2563eb33",
              transition: "background 0.2s",
              "&:hover": { background: roleArn ? "#15803d" : "linear-gradient(135deg, #1d4ed8, #1e40af)" },
              "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
            }}
          >
            {loading ? (roleArn ? "Updating..." : "Creating role...") : roleArn ? "Update trust policy" : "Create IAM Role"}
          </Button>
          {varHasAny && !roleArn && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706" }} />
              <Typography sx={{ fontSize: "0.68rem", color: "#d97706" }}>
                This will overwrite your current connection details
              </Typography>
            </Box>
          )}
        </Box>

        {error && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{error}</Typography>}

        {roleArn && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 15, color: "#16a34a" }} />
            <Typography sx={{ fontSize: "0.72rem", color: "#15803d" }}>
              {wasUpdated ? "Trust policy updated" : "IAM role created"} — connection details saved to GitHub automatically.
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Divider (clickable toggle) ── */}
      <Box
        onClick={() => setVarExpanded((e) => !e)}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, cursor: "pointer", userSelect: "none", py: 0.25 }}
      >
        <Box sx={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
        <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, whiteSpace: "nowrap" }}>
          {varExpanded ? "collapse" : "open to enter application connection detail"}
        </Typography>
        <KeyboardArrowDownIcon
          sx={{ fontSize: 14, color: "#94a3b8", transform: varExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        />
        <Box sx={{ flex: 1, height: "1px", background: "#e2e8f0" }} />
      </Box>

      {/* ── Variable editor (Collapse keeps it mounted so onLoaded fires) ── */}
      <Collapse in={varExpanded} timeout={300} unmountOnExit={false}>
        <VariableEditor
          account={account}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={AWS_VARIABLE_KEYS}
          populate={populate}
          title="Connection details"
          disabled={disabled}
          onComplete={onComplete}
          onAutoSaveResult={(result) => setBannerState(result)}
          githubUrl={githubUrl}
          onLoaded={(saved) => {
            setLoadedVars(saved);
            // Any saved value → expand; none → collapse.
            setVarExpanded(Object.keys(saved).length > 0);
          }}
          autoSaveCounter={autoSaveCounter}
        />
      </Collapse>
    </Box>
  );
}
