import { useEffect, useState } from "react";
import { Box, CircularProgress, MenuItem, Select, Typography } from "@mui/material";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type { Account, CardChrome, GhEnv } from "../types";
import type { UseAzureAccount } from "../hooks/useAzureAccount";
import type { UseAzureSubscription } from "../hooks/useAzureSubscription";
import { tenantDisplayName } from "../api/azureGraph";
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
 * Picks the subscription the corp resources go into, and saves AZURE_TENANT_ID +
 * AZURE_SUBSCRIPTION_ID to the environment's GitHub variables. The tenant itself is
 * chosen on the Azure login card — this card only ever renders once that's done, since
 * it's locked behind "azure_login" until a tenant is confirmed. Lives in the Target
 * group; the selection is fed to the infra, domain, and app-registration cards.
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
  const { tenants, manualTenantId } = azure;
  const { subscriptions, selectedSubscriptionId, setSelectedSubscriptionId, subsError, subscriptionDrift, subscriptionNoAccess } = subscription;
  const [savedVars, setSavedVars] = useState<Record<string, string>>({});

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
  const tenantLabel = tenantDisplayName(tenants, manualTenantId);

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
        Pick the subscription to deploy into. This is where the resource group, storage account and DNS zone will be created, and it's saved to GitHub so
        the pipeline uses the same target.
      </Typography>

      <Typography sx={{ ...labelSx, "& span": { color: "#0f172a", textTransform: "none" } }}>
        Tenant: <span>{tenantLabel}</span>
      </Typography>

      {subsError && !subscriptionNoAccess && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{subsError}</Typography>}

      {/* Subscription */}
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
    </Box>
    </Card>
  );
}
