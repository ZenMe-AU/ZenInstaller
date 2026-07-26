import { Box, Button, CircularProgress, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { AccountInfo } from "@azure/msal-browser";
import type { useCreateDomainSetup } from "../hooks/useCreateDomainSetup";
import type { SetupStep } from "../hooks/useAzureSetup";
import { getVariableDisplayName } from "../logic/variables";
import { MONO as mono, labelSx } from "../config/styles";

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

type Props = ReturnType<typeof useCreateDomainSetup> & {
  disabled: boolean;
  azureAccount: AccountInfo | null;
  corpName: string;
  dnsName: string;
};

export default function CreateDomainDetail({
  checkingStatus,
  checkStatusError,
  steps,
  running,
  resourcesDone,
  nameServers,
  domainVerified,
  isPrimary,
  verifying,
  verifyError,
  verify,
  run,
  reset,
  disabled,
  azureAccount,
  corpName,
  dnsName,
}: Props) {
  const missing: string[] = [];
  if (!corpName) missing.push(getVariableDisplayName("NAME"));
  if (!dnsName) missing.push(getVariableDisplayName("DNS"));
  const ready = !!azureAccount && missing.length === 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
        Creates the DNS zone for <b>{dnsName || "your domain"}</b>, adds it to Entra ID as a custom domain, then verifies it and sets it as primary.
      </Typography>

      {/* Gating hints */}
      {!azureAccount && (
        <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
            Sign in with Azure first — this card reuses that session.
          </Typography>
        </Box>
      )}
      {azureAccount && missing.length > 0 && (
        <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>
            Missing before setup can run: <b>{missing.join(", ")}</b> — fill them in via the Company info card.
          </Typography>
        </Box>
      )}

      {checkingStatus && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <CircularProgress size={12} />
          <Typography sx={{ fontSize: "0.7rem", color: "#94a3b8", ...mono }}>Checking whether this domain is already set up...</Typography>
        </Box>
      )}
      {checkStatusError && (
        <Typography sx={{ fontSize: "0.68rem", color: "#d97706", ...mono }}>Couldn't check existing setup: {checkStatusError}</Typography>
      )}

      {/* Planned resources */}
      {ready && steps.length === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Box>
            <Typography sx={{ ...labelSx, mb: 0.75 }}>Resources</Typography>
            <Box sx={{ borderLeft: "2px solid #e2e8f0", pl: 1.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              {[
                ["DNS zone", dnsName],
                ["Custom domain", dnsName],
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
            {resourcesDone ? "Re-run setup" : "Set up corp domain"}
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

      {/* Name servers + registrar instruction */}
      {nameServers.length > 0 && !domainVerified && (
        <Box
          sx={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "8px",
            px: 2,
            py: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Typography sx={{ fontSize: "0.78rem", color: "#1e40af", fontWeight: 600 }}>Point your domain at Azure DNS</Typography>
          <Typography sx={{ fontSize: "0.72rem", color: "#1e40af" }}>
            At your domain registrar, replace the NS records for <b>{dnsName}</b> with the Azure name servers below. Microsoft can only verify the
            domain once DNS resolves through Azure.
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {nameServers.map((ns) => (
              <Typography key={ns} sx={{ fontSize: "0.75rem", color: "#1e3a8a", ...mono }}>
                {ns}
              </Typography>
            ))}
          </Box>
        </Box>
      )}

      {/* Domain verification + primary promotion (one button drives both) */}
      {resourcesDone && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {domainVerified && isPrimary ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "#16a34a" }} />
              <Typography sx={{ fontSize: "0.78rem", color: "#15803d" }}>
                Domain <b>{dnsName}</b> is verified and set as the primary domain.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                <Button
                  variant="outlined"
                  onClick={verify}
                  disabled={disabled || verifying}
                  startIcon={verifying ? <CircularProgress size={12} /> : undefined}
                  sx={{
                    textTransform: "none",
                    ...mono,
                    fontSize: "0.78rem",
                    borderColor: "#bfdbfe",
                    color: "#1d4ed8",
                    "&:hover": { borderColor: "#93c5fd", background: "#eff6ff" },
                  }}
                >
                  {domainVerified ? "Set as primary domain" : "Verify domain now"}
                </Button>
                {!domainVerified && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <WarningAmberIcon sx={{ fontSize: 13, color: "#d97706" }} />
                    <Typography sx={{ fontSize: "0.68rem", color: "#d97706" }}>DNS propagation can take minutes to hours</Typography>
                  </Box>
                )}
              </Box>
              {verifyError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{verifyError}</Typography>}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
