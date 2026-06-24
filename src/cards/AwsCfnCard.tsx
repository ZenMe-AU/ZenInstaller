import { useState } from "react";
import { Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { useAwsSetup } from "../hooks/useAwsSetup";
import { CLOUD_DOCS } from "../config/docsConfig";
const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const labelSx = { fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", ...mono };

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
      <Typography sx={{ ...labelSx, minWidth: 120 }}>{label}</Typography>
      <Typography sx={{ fontSize: "0.78rem", color: "#1e293b", ...mono, flex: 1, wordBreak: "break-all" }}>{value}</Typography>
      <Button size="small" onClick={copy} sx={{ minWidth: 0, p: 0.5, color: "#94a3b8", "&:hover": { color: "#2563eb" } }}>
        <ContentCopyIcon sx={{ fontSize: 13 }} />
        <Typography sx={{ fontSize: "0.65rem", ml: 0.5, ...mono }}>{copied ? "Copied" : "Copy"}</Typography>
      </Button>
    </Box>
  );
}

type Props = ReturnType<typeof useAwsSetup> & {
  validEnvs: readonly string[];
  disabled: boolean;
  onComplete: (done: boolean) => void;
};

export default function AwsCfnCard({
  accessKeyId,
  setAccessKeyId,
  secretAccessKey,
  setSecretAccessKey,
  roleName,
  setRoleName,
  environments,
  toggleEnv,
  createOidcProvider,
  setCreateOidcProvider,
  loading,
  roleArn,
  error,
  canCreate,
  create,
  validEnvs,
  disabled,
  onComplete,
}: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [done, setDone] = useState(false);

  const handleDone = (checked: boolean) => {
    setDone(checked);
    onComplete(checked);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Don't have an account link */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", ...mono }}>Don't have an account?</Typography>
        <Box
          component="a"
          href={CLOUD_DOCS.aws.createAccount}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "#64748b", textDecoration: "none", "&:hover": { color: "#2563eb" } }}
        >
          <Typography sx={{ fontSize: "0.72rem", ...mono }}>How to Create a Free AWS Account</Typography>
          <OpenInNewIcon sx={{ fontSize: 12 }} />
        </Box>
      </Box>

      {/* Bootstrap credentials */}
      <Box>
        <Typography sx={{ ...labelSx, mb: 0.75 }}>Bootstrap IAM credentials</Typography>
        <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mb: 1.5, lineHeight: 1.6 }}>
          Temporary IAM user credentials with permissions to create the role. Can be deleted after setup.
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

      {/* Environments */}
      <Box>
        <Typography sx={{ ...labelSx, mb: 0.75 }}>GitHub environments (trust policy)</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {validEnvs.map((env) => {
            const selected = environments.includes(env);
            return (
              <Chip
                key={env}
                size="small"
                onClick={() => toggleEnv(env)}
                icon={selected ? <CheckIcon sx={{ fontSize: "12px !important", color: "#2563eb !important" }} /> : undefined}
                label={env}
                sx={{
                  ...mono,
                  fontSize: "0.72rem",
                  cursor: "pointer",
                  background: selected ? "#eff6ff" : "#f1f5f9",
                  color: selected ? "#2563eb" : "#64748b",
                  border: `1px solid ${selected ? "#93c5fd" : "#e2e8f0"}`,
                  fontWeight: selected ? 600 : 400,
                  "&:hover": { background: selected ? "#dbeafe" : "#e2e8f0" },
                  "& .MuiChip-icon": { ml: "6px" },
                }}
              />
            );
          })}
        </Box>
        {environments.length === 0 && (
          <Typography sx={{ fontSize: "0.68rem", color: "#ef4444", ...mono, mt: 0.5 }}>Select at least one environment</Typography>
        )}
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
          <Typography sx={{ fontSize: "0.75rem", color: "#475569", ...mono }}>
            Create GitHub OIDC provider
            <Box component="span" sx={{ color: "#94a3b8", fontSize: "0.68rem", ml: 0.75 }}>
              (check if not already set up in this AWS account)
            </Box>
          </Typography>
        }
      />

      {/* Create Role button */}
      <Box>
        <Button
          variant="contained"
          onClick={create}
          disabled={disabled || !canCreate || loading || done}
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
          {loading ? "Creating role..." : roleArn ? "Role created" : "Create IAM Role"}
        </Button>
      </Box>

      {/* Error */}
      {error && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{error}</Typography>}

      {/* Success: role ARN */}
      {roleArn && (
        <Box sx={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "8px", px: 2, py: 1.5 }}>
          <Typography sx={{ ...labelSx, color: "#16a34a", mb: 0.75 }}>Role created successfully</Typography>
          <CopyRow label="AWS_ROLE_ARN" value={roleArn} />
        </Box>
      )}

      {/* Done checkbox */}
      <FormControlLabel
        control={
          <Checkbox
            checked={done}
            onChange={(e) => handleDone(e.target.checked)}
            size="small"
            sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#16a34a" }, py: 0.5 }}
          />
        }
        label={
          <Typography sx={{ fontSize: "0.75rem", color: done ? "#16a34a" : "#475569", ...mono, fontWeight: done ? 600 : 400 }}>
            I've completed AWS role setup and configured AWS_ROLE_ARN
          </Typography>
        }
      />
    </Box>
  );
}
