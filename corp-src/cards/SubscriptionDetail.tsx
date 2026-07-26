import { useEffect, useRef, useState } from "react";
import { Autocomplete, Box, Button, CircularProgress, MenuItem, Select, TextField, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { AccountInfo } from "@azure/msal-browser";
import type { Account, GhEnv } from "../types";
import type { AzureTenant, Subscription } from "../api/azureGraph";
import { AZURE_TARGET_KEYS } from "../logic/variables";
import CloudVariableDetail from "./CloudVariableDetail";
import { MONO as mono, labelSx } from "../config/styles";

type Props = {
  azureAccount: AccountInfo | null;
  tenants: AzureTenant[];
  manualTenantId: string;
  setManualTenantId: (id: string) => void;
  selectTenant: (tenantId: string) => void;
  subscriptions: Subscription[];
  selectedSubscriptionId: string;
  setSelectedSubscriptionId: (id: string) => void;
  subsError: string | null;
  subscriptionDrift: boolean;
  subscriptionNoAccess: boolean;
  // GitHub context — where AZURE_TENANT_ID + AZURE_SUBSCRIPTION_ID are saved.
  account: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  githubUrl?: string;
  disabled?: boolean;
};

/*
 * Picks the Azure tenant then subscription the corp resources go into, and saves
 * AZURE_TENANT_ID + AZURE_SUBSCRIPTION_ID to the environment's GitHub variables.
 * Lives in the Target group; the selection is fed to the infra, domain, and
 * app-registration cards.
 */
export default function SubscriptionDetail({
  azureAccount,
  tenants,
  manualTenantId,
  setManualTenantId,
  selectTenant,
  subscriptions,
  selectedSubscriptionId,
  setSelectedSubscriptionId,
  subsError,
  subscriptionDrift,
  subscriptionNoAccess,
  account,
  repoName,
  selectedEnv,
  githubUrl,
  disabled,
}: Props) {
  const [savedVars, setSavedVars] = useState<Record<string, string>>({});
  const tenantPrefilledRef = useRef(false);

  // Pre-select tenant from the saved AZURE_TENANT_ID once, trying to load its subscriptions.
  // If it fails (stale id, needs consent) the field is still filled in for the user to retry/edit.
  useEffect(() => {
    if (tenantPrefilledRef.current || manualTenantId) return;
    const saved = savedVars.AZURE_TENANT_ID;
    if (!saved) return;
    tenantPrefilledRef.current = true;
    selectTenant(saved);
  }, [savedVars, manualTenantId, selectTenant]);

  // Pre-select subscription from the saved AZURE_SUBSCRIPTION_ID once its list is loaded.
  useEffect(() => {
    if (selectedSubscriptionId || subscriptions.length === 0) return;
    const saved = savedVars.AZURE_SUBSCRIPTION_ID;
    if (saved && subscriptions.some((s) => s.id === saved)) setSelectedSubscriptionId(saved);
  }, [subscriptions, selectedSubscriptionId, savedVars, setSelectedSubscriptionId]);

  const populate = { AZURE_TENANT_ID: manualTenantId, AZURE_SUBSCRIPTION_ID: selectedSubscriptionId };

  return (
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
          {/* Tenant — pick from the fetched list, or type a tenant ID directly (e.g. personal accounts, which can't list tenants). */}
          <Box>
            <Typography sx={{ ...labelSx, mb: 0.75 }}>Tenant</Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
              <Autocomplete
                freeSolo
                options={tenants.map((t) => t.tenantId)}
                inputValue={manualTenantId}
                onInputChange={(_, v) => setManualTenantId(v)}
                onChange={(_, v) => {
                  if (v) selectTenant(v);
                }}
                renderOption={(props, option) => {
                  const t = tenants.find((x) => x.tenantId === option);
                  return (
                    <Box component="li" {...props} key={option}>
                      <Box>
                        <Typography sx={{ fontSize: "0.8rem", ...mono }}>{t?.displayName ?? option}</Typography>
                        <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono }}>{option}</Typography>
                      </Box>
                    </Box>
                  );
                }}
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
            </Box>
          </Box>

          {subsError && !subscriptionNoAccess && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{subsError}</Typography>}

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

          {subscriptionDrift && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <WarningAmberIcon sx={{ fontSize: 14, color: "#d97706" }} />
              <Typography sx={{ fontSize: "0.72rem", color: "#d97706" }}>Unsaved change — save to apply.</Typography>
            </Box>
          )}

          {/* Save AZURE_TENANT_ID + AZURE_SUBSCRIPTION_ID to the env's GitHub variables */}
          <CloudVariableDetail
            account={account}
            repo={repoName}
            envName={selectedEnv?.name ?? null}
            keys={AZURE_TARGET_KEYS}
            populate={populate}
            title="Saved to GitHub"
            disabled={disabled}
            githubUrl={githubUrl}
            onLoaded={(saved) => setSavedVars(saved)}
          />
        </>
      )}
    </Box>
  );
}
