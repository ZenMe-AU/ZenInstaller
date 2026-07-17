import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Button } from "@mui/material";
import type { CardStatus, GhEnv, PullRequest } from "../types";
import StepWrapper from "../components/StepWrapper";
import PRDetail from "./PRDetail";
import { reactPlugin } from "../monitor/applicationInsights";
import { AppInsightsErrorBoundary } from "@microsoft/applicationinsights-react-js";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  // ── PipelineCard chrome ──────────────────────────────────────────────────
  status: CardStatus;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  // ── Domain ───────────────────────────────────────────────────────────────
  pullRequests: PullRequest[];
  selectedPR: PullRequest | null;
  onSelectPR: (pr: PullRequest | null) => void;
  loading: boolean;
  refreshFailed?: boolean;
  onRefresh: () => void;
  envList: GhEnv[];
  validEnvs: readonly string[];
  repoFullName: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PR({
  status,
  expanded,
  onToggle,
  disabled,
  pullRequests,
  selectedPR,
  onSelectPR,
  loading,
  refreshFailed,
  onRefresh,
  envList,
  validEnvs,
  repoFullName,
}: Props) {
  return (
    <AppInsightsErrorBoundary onError={() => <p>Error: Unable to load component!</p>} appInsights={reactPlugin}>
      <StepWrapper
        title="Pull Request"
        subtitle={selectedPR ? `#${selectedPR.number} · ${selectedPR.title}` : "Optional — select a PR to deploy from"}
        status={status}
        expanded={expanded}
        onToggle={onToggle}
        disabled={disabled}
        action={
          <Button
            size="small"
            variant="outlined"
            endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
            onClick={() => window.open(`https://github.com/${repoFullName}/pulls`, "_blank")}
            sx={{
              borderColor: "#e2e8f0",
              color: "#475569",
              fontSize: "0.75rem",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { borderColor: "#cbd5e1", color: "#0f172a", background: "#f8fafc" },
            }}
          >
            Pull Requests on GitHub
          </Button>
        }
      >
        <PRDetail
          pullRequests={pullRequests}
          selectedPR={selectedPR}
          onSelectPR={onSelectPR}
          loading={loading}
          refreshFailed={refreshFailed}
          onRefresh={onRefresh}
          envList={envList}
          validEnvs={validEnvs}
        />
      </StepWrapper>
    </AppInsightsErrorBoundary>
  );
}
