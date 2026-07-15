import { useState, useEffect, useRef } from "react";
import { Box, Button, CircularProgress, Collapse, IconButton, InputAdornment, MenuItem, TextField, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, GhEnv } from "../types";
import type { useAwsSetup, SetupStep } from "../hooks/useAwsSetup";
import { AWS_VARIABLE_KEYS } from "../logic/variables";
import { CLOUD_DOCS } from "../config/docsConfig";
import CloudVariableDetail from "./CloudVariableDetail";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const labelSx = { fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", ...mono };

function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#22c55e" }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444" }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} sx={{ color: "#2563eb" }} />
    ) : (
      <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontSize: "0.78rem", color: step.status === "error" ? "#ef4444" : "#475569", ...mono }}>{step.label}</Typography>
        {step.detail && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.25 }}>{step.detail}</Typography>}
      </Box>
    </Box>
  );
}

type Props = ReturnType<typeof useAwsSetup> & {
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  disabled: boolean;
  onComplete: (done: boolean) => void;
  githubUrl?: string;
  /** Invalidates the last pipeline run's AWS-connectivity result — call when a
   *  connection-detail variable is edited, since the old validation no longer applies. */
  onAwsValid?: (valid: boolean | null) => void;
};

export default function AwsDeployDetail({
  accessKeyId,
  setAccessKeyId,
  secretAccessKey,
  setSecretAccessKey,
  identity,
  mfaDevices,
  selectedMfaSerial,
  setSelectedMfaSerial,
  mfaTokenCode,
  setMfaTokenCode,
  needsMfa,
  fidoOnly,
  signedIn,
  signingIn,
  signInError,
  canSignIn,
  signIn,
  signOut,
  roleName,
  setRoleName,
  setEnvironments,
  loading,
  steps,
  roleArn,
  error,
  canCreate,
  create,
  resetRoleCreation,
  account,
  repoName,
  selectedEnv,
  disabled,
  onComplete,
  githubUrl,
  onAwsValid,
}: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [varExpanded, setVarExpanded] = useState(false);
  const [loadedVars, setLoadedVars] = useState<Record<string, string> | null>(null);
  const [autoSaveCounter, setAutoSaveCounter] = useState(0);
  const [bannerState, setBannerState] = useState<"none" | "saved" | "no-changes" | "error">("none");
  const prevRoleArnRef = useRef<string | null>(null);
  const prefilledRoleRef = useRef(false);

  const varHasAny = !!loadedVars && Object.keys(loadedVars).length > 0;
  const usableDevices = mfaDevices.filter((d) => d.usable);

  // Create action also dismisses the banner.
  const handleCreate = () => {
    setBannerState("none");
    create();
  };
  const handleRetry = () => {
    setBannerState("none");
    resetRoleCreation();
  };

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
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            background: bannerState === "error" ? "#fef9c3" : "#f0fdf4",
            border: `1px solid ${bannerState === "error" ? "#fde047" : "#bbf7d0"}`,
            borderRadius: "8px",
            px: 1.5,
            py: 1,
          }}
        >
          {bannerState === "error" ? (
            <WarningAmberIcon sx={{ fontSize: 16, color: "#d97706" }} />
          ) : (
            <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#16a34a" }} />
          )}
          <Typography sx={{ fontSize: "0.75rem", color: bannerState === "error" ? "#713f12" : "#15803d" }}>
            {bannerState === "saved" && "Connection details saved."}
            {bannerState === "no-changes" && "Connection details saved — no changes needed."}
            {bannerState === "error" && "Some connection details failed to save — check below."}
          </Typography>
        </Box>
      )}

      {/* ── Create section ── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Description — always visible, regardless of banner/sign-in state */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
            We'll create an IAM role GitHub can assume via OIDC, then save the connection details automatically. We never store your AWS access key or
            secret key — they're used only in your browser to sign in and are never sent to our servers.
          </Typography>
        </Box>

        {!signedIn && (
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
        )}

        {/* Bootstrap credentials */}
        <Box>
          {!signedIn && (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                <Typography sx={labelSx}>Credentials</Typography>
                <Box
                  component="a"
                  href={CLOUD_DOCS.aws.bootstrapCredentials}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.25,
                    color: "#2563eb",
                    textDecoration: "none",
                    fontSize: "0.68rem",
                    ...mono,
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Set-up guide
                  <OpenInNewIcon sx={{ fontSize: 11 }} />
                </Box>
              </Box>
              <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", mb: 1.5, lineHeight: 1.6 }}>
                Generate access keys from your AWS account's Security credentials. Can be deleted after setup.
              </Typography>
            </>
          )}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {!signedIn && (
              <>
                <TextField
                  size="small"
                  label="Access Key ID"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="AKIA..."
                  disabled={!!identity || signingIn}
                  sx={{ maxWidth: 340 }}
                  InputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                />
                <TextField
                  size="small"
                  label="Secret Access Key"
                  type={showSecret ? "text" : "password"}
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  disabled={!!identity || signingIn}
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
              </>
            )}

            {/* Identity — shown as soon as the caller is resolved, before MFA completes */}
            {identity && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
                  {signedIn ? "Signed in as " : "Authenticating as "}
                  <Box component="span" sx={{ fontWeight: 600, ...mono }}>
                    {identity.username}
                  </Box>
                  <Box component="span" sx={mono}>
                    {" "}
                    ({identity.accountId})
                  </Box>
                </Typography>
                <Button
                  size="small"
                  onClick={signOut}
                  sx={{
                    minWidth: 0,
                    fontSize: "0.68rem",
                    color: "#94a3b8",
                    textTransform: "none",
                    ...mono,
                    py: 0.25,
                    "&:hover": { color: "#ef4444" },
                  }}
                >
                  Sign out
                </Button>
              </Box>
            )}

            {/* MFA — only while completing sign-in with a usable (TOTP) device */}
            {needsMfa && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {usableDevices.length > 1 && (
                  <TextField
                    select
                    size="small"
                    label="MFA device"
                    value={selectedMfaSerial ?? ""}
                    onChange={(e) => setSelectedMfaSerial(e.target.value)}
                    helperText="Pick the device you have on hand"
                    sx={{ maxWidth: 280 }}
                    InputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                  >
                    {usableDevices.map((d) => (
                      <MenuItem key={d.serialNumber} value={d.serialNumber} sx={{ fontSize: "0.8rem", ...mono }}>
                        {d.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  size="small"
                  label="MFA code"
                  value={mfaTokenCode}
                  onChange={(e) => setMfaTokenCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSignIn && !signingIn) signIn();
                  }}
                  placeholder="123456"
                  autoFocus
                  helperText={usableDevices.length > 1 ? "Code from the selected device" : `Code from ${usableDevices[0]?.name ?? "your MFA device"}`}
                  inputProps={{ maxLength: 6, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", letterSpacing: "0.2em" } }}
                  sx={{ maxWidth: 160 }}
                />
              </Box>
            )}

            {/* FIDO-only accounts can't complete MFA over the API */}
            {fidoOnly && (
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, maxWidth: 420 }}>
                <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706", mt: "2px" }} />
                <Typography sx={{ fontSize: "0.68rem", color: "#92400e", lineHeight: 1.6 }}>
                  Your only MFA is a security key (FIDO), which AWS can't use for CLI/API sign-in. We'll continue without MFA — if your account
                  requires MFA, register an authenticator-app (TOTP) device or use access keys that don't enforce MFA.
                </Typography>
              </Box>
            )}

            {/* Sign-in button — until a session token is established */}
            {!signedIn && (
              <Box>
                <Button
                  variant="contained"
                  onClick={signIn}
                  disabled={disabled || !canSignIn || signingIn}
                  startIcon={signingIn ? <CircularProgress size={14} sx={{ color: "inherit" }} /> : undefined}
                  sx={{
                    alignSelf: "flex-start",
                    background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                    textTransform: "none",
                    ...mono,
                    fontSize: "0.85rem",
                    py: 1,
                    px: 2.5,
                    borderRadius: "8px",
                    boxShadow: "0 2px 8px #2563eb33",
                    "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
                    "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                  }}
                >
                  {signingIn ? "Signing in…" : needsMfa ? "Verify & sign in" : "Sign in"}
                </Button>
              </Box>
            )}

            {signInError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{signInError}</Typography>}
          </Box>
        </Box>

        {/* Role configuration + create — revealed only once signed in */}
        {signedIn && (
          <>
            {/* Role name + OIDC toggle + create button */}
            {steps.length === 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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

                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                  <Button
                    variant="contained"
                    onClick={handleCreate}
                    disabled={disabled || !canCreate}
                    sx={{
                      background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                      textTransform: "none",
                      ...mono,
                      fontSize: "0.85rem",
                      py: 1,
                      px: 2.5,
                      borderRadius: "8px",
                      boxShadow: "0 2px 8px #2563eb33",
                      "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)" },
                      "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                    }}
                  >
                    Create IAM Role
                  </Button>
                  {varHasAny && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706" }} />
                      <Typography sx={{ fontSize: "0.68rem", color: "#d97706" }}>This will overwrite your current connection details</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            {/* Progress steps */}
            {steps.length > 0 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid #e2e8f0", pl: 1.5 }}>
                {steps.map((s) => (
                  <StepRow key={s.id} step={s} />
                ))}
                {loading && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", mt: 0.5 }}>Running...</Typography>}
                {!loading && (
                  <Button
                    size="small"
                    onClick={handleRetry}
                    sx={{
                      alignSelf: "flex-start",
                      mt: 0.5,
                      textTransform: "none",
                      ...mono,
                      fontSize: "0.72rem",
                      color: "#64748b",
                      "&:hover": { color: "#2563eb" },
                    }}
                  >
                    ↩ Try again
                  </Button>
                )}
              </Box>
            )}

            {error && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{error}</Typography>}
          </>
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
        <CloudVariableDetail
          account={account}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={AWS_VARIABLE_KEYS}
          populate={populate}
          title="Connection details"
          disabled={disabled}
          onComplete={onComplete}
          onAutoSaveResult={(result) => setBannerState(result)}
          onSaved={() => onAwsValid?.(null)}
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
