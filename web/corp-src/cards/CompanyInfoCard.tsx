import { Box, Button, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { Account, CardChrome, GhEnv } from "../types";
import { GITHUB_VARIABLE_KEYS } from "../logic/variables";
import VariablesCard from "../components/VariablesCard";
import RefreshButton from "../components/RefreshButton";
import SaveButton from "../components/SaveButton";
import Card from "../components/Card";
import ViewLink from "../components/ViewLink";
import { getVariablesUrl } from "../logic/github";
import { useRefreshIndicator } from "../hooks/util/useRefreshIndicator";
import { useVariableEditor } from "../hooks/util/useVariableEditor";
import { sectionLabelSx } from "../config/styles";
import type { UseGithubVariables } from "../hooks/useGithubVariables";

// ─── Props ────────────────────────────────────────────────────────────────────

type DetailProps = {
  account: Account | null;
  repo: string;
  selectedEnv: GhEnv;
  variableValues: Record<string, string>;
  onVariableRecheck: () => void;
  variablesRechecking: boolean;
  varRecheckFailed?: boolean;
  onVariableConfirmed: (key: string, value: string) => void;
  githubUrl?: string;
};

function Intro() {
  return (
    <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
      {" "}
      Variables used by GitHub Actions when building and deploying this environment.
    </Typography>
  );
}

function Action({ repoFullName }: { repoFullName: string | null }) {
  if (!repoFullName) return null;
  return <ViewLink href={getVariablesUrl(repoFullName)} />;
}

/*
 * Azure/AWS infra variables (AZURE_CLIENT_ID, AWS_ROLE_ARN, …) save from their own
 * setup cards — this section only manages deployment variables (Company & Domain).
 * Not exported: only rendered by CompanyInfoCard below, once selectedEnv is non-null
 * (useVariableEditor needs a concrete envName, so it can't run before one is picked).
 */
function CompanyInfoDetailBody({
  account,
  repo,
  selectedEnv,
  variableValues,
  onVariableRecheck,
  variablesRechecking,
  varRecheckFailed,
  onVariableConfirmed,
  githubUrl,
}: DetailProps) {
  const { refreshResult, markClicked } = useRefreshIndicator(variablesRechecking, varRecheckFailed);

  const {
    localValues: localVarValues,
    upsertStatuses: varUpsertStatuses,
    updating: updatingVars,
    dirtyKeys: dirtyVarKeys,
    onChange: handleVarChange,
    onRevert: handleVarRevert,
    onSave,
  } = useVariableEditor({
    keys: GITHUB_VARIABLE_KEYS,
    savedValues: variableValues,
    account,
    repo,
    envName: selectedEnv.name,
    onSavedKey: onVariableConfirmed,
  });

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
            <Typography sx={sectionLabelSx}>Company & Domain</Typography>
            {(() => {
              const n = GITHUB_VARIABLE_KEYS.filter((k) => !variableValues[k]).length;
              return n > 0 ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <ErrorOutlineIcon sx={{ fontSize: 12, color: "#ea580c" }} />
                  <Typography sx={{ fontSize: "0.65rem", color: "#ea580c" }}>{n} not configured</Typography>
                </Box>
              ) : null;
            })()}
          </Box>
          <Intro />
        </Box>
        <RefreshButton
          busy={variablesRechecking}
          result={refreshResult}
          sx={{ ml: 2, mt: 0.25 }}
          onClick={() => {
            markClicked();
            onVariableRecheck();
          }}
        />
      </Box>

      {/* Variable rows */}
      <Box sx={{ mt: 1 }}>
        <VariablesCard
          requiredKeys={GITHUB_VARIABLE_KEYS}
          savedValues={variableValues}
          localValues={localVarValues}
          upsertStatuses={varUpsertStatuses}
          onChange={handleVarChange}
          onRevert={handleVarRevert}
        />
      </Box>

      {/* Save button row */}
      <Box sx={{ mt: 2, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <SaveButton
          verb="Save"
          noun="variable"
          count={dirtyVarKeys.length}
          loading={updatingVars}
          onClick={() => void onSave()}
        />
        {githubUrl && (
          <Button
            size="small"
            aria-label="Manage on GitHub"
            endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
            onClick={() => window.open(githubUrl, "_blank")}
            sx={{
              flexShrink: 0,
              fontSize: "0.7rem",
              color: "#64748b",
              textTransform: "none",
              fontFamily: "'IBM Plex Mono', monospace",
              "&:hover": { color: "#0f172a" },
            }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
              Manage on GitHub
            </Box>
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

type Props = {
  card: CardChrome;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubAccount: Account | null;
  repoName: string;
  githubUrl?: string;
};

export default function CompanyInfoCard({ card, selectedEnv, variables, githubAccount, repoName, githubUrl }: Props) {
  return (
    <Card
      title="Company info"
      action={<Action repoFullName={githubAccount && repoName ? `${githubAccount.login}/${repoName}` : null} />}
      lockedIntro={<Intro />}
      {...card}
    >
      {selectedEnv && (
        <CompanyInfoDetailBody
          account={githubAccount}
          repo={repoName}
          selectedEnv={selectedEnv}
          variableValues={variables.values}
          onVariableRecheck={variables.onRefresh}
          variablesRechecking={variables.refreshing}
          varRecheckFailed={variables.error}
          onVariableConfirmed={variables.onConfirmed}
          githubUrl={githubUrl}
        />
      )}
    </Card>
  );
}
