import { useEffect, useRef, useState } from "react";
import { Autocomplete, Box, Button, CircularProgress, MenuItem, Select, TextField, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, CardChrome, GhEnv } from "../types";
import type { UseAzureAccount } from "../hooks/useAzureAccount";
import type { UseAzureSubscription } from "../hooks/useAzureSubscription";
import { AZURE_TARGET_KEYS } from "../logic/variables";
import CloudVariableDetail from "./CloudVariableDetail";
import Card from "../components/Card";
import ConfigErrorNotice from "../components/ConfigErrorNotice";
import { MONO as mono, labelSx } from "../config/styles";

type Props = {
  card: CardChrome;
  azure: UseAzureAccount;
  subscription: UseAzureSubscription;
  // GitHub context — where AZURE_TENANT_ID + AZURE_SUBSCRIPTION_ID are saved.
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  onVariableConfirmed: (key: string, value: string) => void;
  githubUrl?: string;
  configured: boolean;
};

/*
 * Picks the Azure tenant then subscription the corp resources go into, and saves
 * AZURE_TENANT_ID + AZURE_SUBSCRIPTION_ID to the environment's GitHub variables.
 * Lives in the Target group; the selection is fed to the infra, domain, and
 * app-registration cards.
 */
export default function AzureSubscriptionCard({
  card,
  azure,
  subscription,
  githubAccount,
  repoName,
  selectedEnv,
  onVariableConfirmed,
  githubUrl,
  configured,
}: Props) {
  const { account: azureAccount, tenants, manualTenantId, setManualTenantId, selectTenant } = azure;
  const { subscriptions, selectedSubscriptionId, setSelectedSubscriptionId, subsError, subscriptionDrift, subscriptionNoAccess } = subscription;
  const [savedVars, setSavedVars] = useState<Record<string, string>>({});
  // Which saved tenant value we've already tried to auto-load, so a fresh save can retrigger it once.
  const appliedSavedTenantRef = useRef<string | null>(null);

  /*
   * Pre-fill the tenant from the saved AZURE_TENANT_ID and try loading it — this always wins over
   * any live guess already in the field (e.g. useAzureAppRegistration's MSA first-tenant auto-select), so a
   * returning user always sees their saved target, not whatever tenant happened to auto-select first.
   */
  useEffect(() => {
    const saved = savedVars.AZURE_TENANT_ID;
    if (!saved || appliedSavedTenantRef.current === saved) return;
    appliedSavedTenantRef.current = saved;
    selectTenant(saved);
  }, [savedVars, selectTenant]);

  // Pre-select subscription from the saved AZURE_SUBSCRIPTION_ID once its list is loaded.
  useEffect(() => {
    if (selectedSubscriptionId || subscriptions.length === 0) return;
    const saved = savedVars.AZURE_SUBSCRIPTION_ID;
    if (saved && subscriptions.some((s) => s.id === saved)) setSelectedSubscriptionId(saved);
  }, [subscriptions, selectedSubscriptionId, savedVars, setSelectedSubscriptionId]);

  // Once the current tenant's subscriptions are known, a selection that doesn't belong to it (e.g. left
  // over from a different tenant) is invalid — clear it rather than let it silently stay "selected".
  useEffect(() => {
    if (!selectedSubscriptionId || subscriptions.length === 0) return;
    if (!subscriptions.some((s) => s.id === selectedSubscriptionId)) setSelectedSubscriptionId("");
  }, [subscriptions, selectedSubscriptionId, setSelectedSubscriptionId]);

  const populate = { AZURE_TENANT_ID: manualTenantId, AZURE_SUBSCRIPTION_ID: selectedSubscriptionId };

  const isSavedTenantCurrent = !!savedVars.AZURE_TENANT_ID && manualTenantId === savedVars.AZURE_TENANT_ID;

  // A tenant list was fetched, but the saved tenant doesn't appear in it — an error, not just a warning.
  const savedTenantNotInList = isSavedTenantCurrent && tenants.length > 0 && !tenants.some((t) => t.tenantId === savedVars.AZURE_TENANT_ID);

  // No tenant list at all (MSA fallback) and the saved tenant's subscriptions failed to load — shown
  // beside the "Load subscriptions" button rather than as a separate block.
  const savedTenantPrefillFailed = isSavedTenantCurrent && tenants.length === 0 && !!subsError && subscriptions.length === 0;

  if (!configured) {
    return (
      <Card title="Azure subscription" {...card}>
        <ConfigErrorNotice />
      </Card>
    );
  }

  return (
    <Card title="Azure subscription" {...card}>
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
        Pick the Azure tenant and subscription to deploy into. This is where the resource group, storage account and DNS zone will be created, and it's
        saved to GitHub so the pipeline uses the same target.
      </Typography>

      {!azureAccount ? (
        <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: "0.75rem", color: "#713f12" }}>Sign in with Azure first — this card reuses that session.</Typography>
        </Box>
      ) : (
        <>
          {/* Tenant */}
          <Box>
            <Typography sx={{ ...labelSx, mb: 0.75 }}>Tenant</Typography>
            {tenants.length > 0 ? (
              // Fetched (or MSA-fallback) list available — plain dropdown, picking loads that tenant immediately.
              <Select
                size="small"
                value={manualTenantId || ""}
                onChange={(e) => selectTenant(e.target.value)}
                displayEmpty
                renderValue={(v) => {
                  if (!v) return <Typography sx={{ fontSize: "0.8rem", color: "#94a3b8", ...mono }}>Select a tenant</Typography>;
                  const t = tenants.find((x) => x.tenantId === v);
                  return <Typography sx={{ fontSize: "0.8rem", ...mono }}>{t?.displayName ?? v}</Typography>;
                }}
                sx={{ minWidth: { xs: 0, sm: 380 }, width: "100%", fontSize: "0.8rem", ...mono }}
              >
                {tenants.map((t) => (
                  <MenuItem key={t.tenantId} value={t.tenantId} sx={{ py: 0.75 }}>
                    <Box>
                      <Typography sx={{ fontSize: "0.8rem", ...mono }}>{t.displayName}</Typography>
                      <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono }}>{t.tenantId}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            ) : (
              // Nothing fetched yet (e.g. personal account with no cached tenant) — type one in directly.
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Autocomplete
                  freeSolo
                  options={[]}
                  inputValue={manualTenantId}
                  onInputChange={(_, v) => setManualTenantId(v)}
                  sx={{ minWidth: { xs: 0, sm: 320 }, width: "100%" }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      placeholder="Tenant name or ID"
                      onKeyDown={(e) => e.key === "Enter" && selectTenant(manualTenantId)}
                      inputProps={{ ...params.inputProps, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                    />
                  )}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => selectTenant(manualTenantId)}
                  disabled={!manualTenantId.trim()}
                  sx={{ background: "#2563eb", textTransform: "none", ...mono, fontSize: "0.78rem", "&:hover": { background: "#1d4ed8" } }}
                >
                  Load subscriptions
                </Button>
                {savedTenantPrefillFailed && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706" }} />
                    <Typography sx={{ fontSize: "0.72rem", color: "#d97706" }}>
                      Saved tenant isn't in your available tenant list — check the ID or pick another.
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Box>

          {savedTenantNotInList ? (
            <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>Saved tenant not found — please pick another.</Typography>
          ) : (
            !savedTenantPrefillFailed &&
            subsError &&
            !subscriptionNoAccess && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{subsError}</Typography>
          )}

          {/* Subscription */}
          {manualTenantId && (
            <Box>
              <Typography sx={{ ...labelSx, mb: 0.75 }}>Subscription</Typography>
              {subscriptions.length > 0 ? (
                <Select
                  size="small"
                  value={selectedSubscriptionId || ""}
                  onChange={(e) => setSelectedSubscriptionId(e.target.value)}
                  displayEmpty
                  renderValue={(v) => {
                    if (!v) return <Typography sx={{ fontSize: "0.8rem", color: "#94a3b8", ...mono }}>Select a subscription</Typography>;
                    const name = subscriptions.find((s) => s.id === v)?.displayName ?? v;
                    return <Typography sx={{ fontSize: "0.8rem", ...mono }}>{name}</Typography>;
                  }}
                  sx={{ minWidth: { xs: 0, sm: 380 }, width: "100%", fontSize: "0.8rem", ...mono }}
                >
                  {subscriptions.map((s) => (
                    <MenuItem key={s.id} value={s.id} sx={{ py: 0.75 }}>
                      <Box>
                        <Typography sx={{ fontSize: "0.8rem", ...mono }}>{s.displayName}</Typography>
                        <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono }}>{s.id}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              ) : subscriptionNoAccess ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706" }} />
                  <Typography sx={{ fontSize: "0.75rem", color: "#d97706" }}>This tenant has no subscriptions you can access.</Typography>
                </Box>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={12} sx={{ color: "#cbd5e1" }} />
                  <Typography sx={{ fontSize: "0.75rem", color: "#94a3b8", ...mono }}>Loading subscriptions...</Typography>
                </Box>
              )}
            </Box>
          )}

          {!selectedEnv && (
            <Typography sx={{ fontSize: "0.72rem", color: "#d97706" }}>
              Select a repository & environment to save the tenant and subscription to GitHub.
            </Typography>
          )}

          {/* Save AZURE_TENANT_ID + AZURE_SUBSCRIPTION_ID to the env's GitHub variables */}
          <CloudVariableDetail
            account={githubAccount}
            repo={repoName}
            envName={selectedEnv?.name ?? null}
            keys={AZURE_TARGET_KEYS}
            populate={populate}
            title="Saved to GitHub"
            githubUrl={githubUrl}
            saveHint={
              subscriptionDrift ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706" }} />
                  <Typography sx={{ fontSize: "0.72rem", color: "#d97706" }}>Unsaved change — save to apply.</Typography>
                </Box>
              ) : undefined
            }
            onLoaded={(saved) => setSavedVars(saved)}
            onSaved={(savedKeys) => {
              // Reflect the save immediately in App's env cache so drift clears without a full recheck.
              for (const key of savedKeys) {
                const value = populate[key as keyof typeof populate];
                if (value !== undefined) onVariableConfirmed(key, value);
              }
            }}
          />
        </>
      )}
    </Box>
    </Card>
  );
}
