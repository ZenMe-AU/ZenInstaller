import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import type { AccountInfo } from "@azure/msal-browser";
import type { useTerraformSetup } from "../hooks/useTerraformSetup";
import type { SetupStep } from "../hooks/useAzureSetup";
import { getVariableDisplayName } from "../logic/variables";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const labelSx = { fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", ...mono };

function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#22c55e" }} />
    ) : step.status === "skipped" ? (
      <RemoveCircleOutlineIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
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
        {step.detail && (
          <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.25, wordBreak: "break-all" }}>{step.detail}</Typography>
        )}
      </Box>
    </Box>
  );
}

type Props = ReturnType<typeof useTerraformSetup> & {
  disabled: boolean;
  azureAccount: AccountInfo | null;
  corpName: string;
  subscriptionId: string;
  spClientId: string;
  storageReady: boolean;
};

export default function TfBackendDetail({
  steps,
  running,
  done,
  run,
  reset,
  resourceGroupName,
  storageAccountName,
  containerName,
  disabled,
  azureAccount,
  corpName,
  subscriptionId,
  spClientId,
  storageReady,
}: Props) {
  const missing: string[] = [];
  if (!corpName) missing.push(getVariableDisplayName("NAME"));
  if (!subscriptionId) missing.push("AZURE_SUBSCRIPTION_ID");
  if (!spClientId) missing.push("AZURE_CLIENT_ID");
  const ready = !!azureAccount && missing.length === 0 && storageReady;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
        Creates the{" "}
        <Box component="span" sx={mono}>
          {containerName}
        </Box>{" "}
        container in the private storage account and grants the service principal <b>Storage Blob Data Contributor</b> role on it. The container is
        used by Terraform to store state and lock files for the corp environment.
      </Typography>

      {/* Gating hints */}
      {!azureAccount && (
        <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
            Sign in with Azure in the <b>Let GitHub deploy to Azure</b> card first — this card reuses that session.
          </Typography>
        </Box>
      )}
      {azureAccount && missing.length > 0 && (
        <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
            Missing before setup can run: <b>{missing.join(", ")}</b>
          </Typography>
        </Box>
      )}
      {azureAccount && missing.length === 0 && !storageReady && (
        <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
            Run <b>Corp Domain Setup</b> first — the storage account{" "}
            <Box component="span" sx={mono}>
              {storageAccountName}
            </Box>{" "}
            doesn't exist yet.
          </Typography>
        </Box>
      )}

      {/* Backend summary + run */}
      {ready && steps.length === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box>
            <Typography sx={{ ...labelSx, mb: 0.75 }}>Backend config</Typography>
            <Box sx={{ borderLeft: "2px solid #e2e8f0", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              {[
                ["resource_group_name", resourceGroupName],
                ["storage_account_name", storageAccountName],
                ["container_name", containerName],
              ].map(([label, value]) => (
                <Typography key={label} sx={{ fontSize: "0.75rem", color: "#64748b", ...mono }}>
                  {label}:{" "}
                  <Box component="span" sx={{ color: "#0f172a" }}>
                    {value}
                  </Box>
                </Typography>
              ))}
            </Box>
          </Box>

          <Button
            variant="contained"
            onClick={run}
            disabled={disabled || running}
            sx={{
              alignSelf: "flex-start",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              textTransform: "none",
              ...mono,
              fontSize: "0.85rem",
              py: 0.85,
              px: 2.5,
              borderRadius: "8px",
              boxShadow: "0 2px 6px #2563eb33",
              "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)" },
              "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
            }}
          >
            {done ? "Re-run setup" : "Create terraform backend"}
          </Button>
        </Box>
      )}

      {/* Progress steps */}
      {steps.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid #e2e8f0", pl: 1.5 }}>
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
          {running && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", mt: 0.5 }}>Running...</Typography>}
          {!running && (
            <Button
              size="small"
              onClick={reset}
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
              ↩ Start over
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}
