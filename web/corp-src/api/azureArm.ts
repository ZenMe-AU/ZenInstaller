import type { AccountInfo } from "@azure/msal-browser";
import { getToken, gFetch } from "./azureGraph";
import { ARM_SCOPES, RBAC_ROLE_IDS } from "../config/azureConfig";
import { deterministicUuid } from "../logic/crypto";

const ARM = "https://management.azure.com";

// ── Shared helpers ─────────────────────────────────────────────────────────────

type ArmResource = {
  id?: string;
  properties?: {
    provisioningState?: string;
    nameServers?: string[];
    TXTRecords?: { value: string[] }[];
  };
};

/** GET that treats 404 as null instead of throwing. */
async function armGet(token: string, path: string): Promise<ArmResource | null> {
  try {
    return await gFetch(token, ARM, path);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("404")) return null;
    throw err;
  }
}

/** Polls fetchState until it returns "Succeeded". Throws on "Failed"/"Canceled" or timeout. */
async function pollProvisioning(fetchState: () => Promise<string | undefined>, resourceLabel: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const state = await fetchState();
    if (state === "Succeeded") return;
    if (state === "Failed" || state === "Canceled") throw new Error(`${resourceLabel} provisioning ${state}`);
    if (Date.now() - start > timeoutMs) throw new Error(`${resourceLabel} provisioning timed out`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

export type EnsureResult = "created" | "exists";

// ── Locations ───────────────────────────────────────────────────────────────────

export type AzureLocation = { name: string; displayName: string };

/** Lists physical Azure regions available to the subscription (excludes logical/paired regions). */
export async function listLocations(account: AccountInfo, subscriptionId: string, overrideTenantId?: string): Promise<AzureLocation[]> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const data = await gFetch(token, ARM, `/subscriptions/${subscriptionId}/locations?api-version=2022-12-01`);
  const raw: { name: string; displayName: string; metadata?: { regionType?: string } }[] = data?.value ?? [];
  return raw
    .filter((l) => l.metadata?.regionType === "Physical")
    .map((l) => ({ name: l.name, displayName: l.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// ── Resource group ─────────────────────────────────────────────────────────────

export async function ensureResourceGroup(
  account: AccountInfo,
  subscriptionId: string,
  name: string,
  location: string,
  overrideTenantId?: string,
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourcegroups/${name}?api-version=2021-04-01`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({ location }) });
  return "created";
}

// ── Log Analytics workspace ────────────────────────────────────────────────────

export async function ensureLogAnalyticsWorkspace(
  account: AccountInfo,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  overrideTenantId?: string,
): Promise<{ id: string; result: EnsureResult }> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${name}?api-version=2022-10-01`;
  const existing = await armGet(token, path);
  if (existing) return { id: existing.id ?? "", result: "exists" };
  const created = await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ location, properties: { sku: { name: "PerGB2018" }, retentionInDays: 30 } }),
  });
  await pollProvisioning(async () => {
    const t = await getToken(account, ARM_SCOPES, overrideTenantId);
    return (await armGet(t, path))?.properties?.provisioningState;
  }, "Log Analytics workspace");
  return { id: created?.id ?? (await armGet(token, path))?.id ?? "", result: "created" };
}

// ── Subscription activity-log diagnostics ──────────────────────────────────────

export async function ensureSubscriptionDiagnostics(
  account: AccountInfo,
  subscriptionId: string,
  settingName: string,
  workspaceId: string,
  overrideTenantId?: string,
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/providers/Microsoft.Insights/diagnosticSettings/${settingName}?api-version=2021-05-01-preview`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        workspaceId,
        logs: [
          { category: "Administrative", enabled: true },
          { category: "Security", enabled: true },
        ],
      },
    }),
  });
  return "created";
}

// ── Application Insights ───────────────────────────────────────────────────────

export async function ensureAppInsights(
  account: AccountInfo,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  workspaceId: string,
  overrideTenantId?: string,
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/components/${name}?api-version=2020-02-02`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ location, kind: "web", properties: { Application_Type: "web", WorkspaceResourceId: workspaceId } }),
  });
  return "created";
}

// ── DNS zone + TXT record ──────────────────────────────────────────────────────

export async function ensureDnsZone(
  account: AccountInfo,
  subscriptionId: string,
  resourceGroup: string,
  dnsName: string,
  overrideTenantId?: string,
): Promise<{ nameServers: string[]; result: EnsureResult }> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/dnsZones/${dnsName}?api-version=2018-05-01`;
  const existing = await armGet(token, path);
  if (existing) return { nameServers: existing.properties?.nameServers ?? [], result: "exists" };
  const created = await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({ location: "global" }) });
  return { nameServers: created?.properties?.nameServers ?? [], result: "created" };
}

/** Ensures the apex TXT record contains `value`. Merges with existing TXT values rather than overwriting. */
export async function ensureDnsTxtRecord(
  account: AccountInfo,
  subscriptionId: string,
  resourceGroup: string,
  dnsName: string,
  value: string,
  overrideTenantId?: string,
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/dnsZones/${dnsName}/TXT/@?api-version=2018-05-01`;
  const existing = await armGet(token, path);
  const records: { value: string[] }[] = existing?.properties?.TXTRecords ?? [];
  if (records.some((r) => r.value.includes(value))) return "exists";
  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ properties: { TTL: 3600, TXTRecords: [...records, { value: [value] }] } }),
  });
  return "created";
}

// ── Storage account + container ────────────────────────────────────────────────

export async function ensureStorageAccount(
  account: AccountInfo,
  subscriptionId: string,
  resourceGroup: string,
  name: string,
  location: string,
  overrideTenantId?: string,
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${name}?api-version=2023-01-01`;
  if (await armGet(token, path)) return "exists";

  const availability = await gFetch(token, ARM, `/subscriptions/${subscriptionId}/providers/Microsoft.Storage/checkNameAvailability?api-version=2023-01-01`, {
    method: "POST",
    body: JSON.stringify({ name, type: "Microsoft.Storage/storageAccounts" }),
  });
  if (availability?.nameAvailable === false) {
    throw new Error(`Storage account name "${name}" unavailable: ${availability.message ?? availability.reason}`);
  }

  await gFetch(token, ARM, path, {
    method: "PUT",
    body: JSON.stringify({ location, sku: { name: "Standard_LRS" }, kind: "StorageV2" }),
  });
  await pollProvisioning(async () => {
    const t = await getToken(account, ARM_SCOPES, overrideTenantId);
    return (await armGet(t, path))?.properties?.provisioningState;
  }, "Storage account");
  return "created";
}

export async function ensureStorageContainer(
  account: AccountInfo,
  subscriptionId: string,
  resourceGroup: string,
  storageAccountName: string,
  containerName: string,
  overrideTenantId?: string,
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const path = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/blobServices/default/containers/${containerName}?api-version=2023-01-01`;
  if (await armGet(token, path)) return "exists";
  await gFetch(token, ARM, path, { method: "PUT", body: JSON.stringify({ properties: { publicAccess: "None" } }) });
  return "created";
}

// ── Scoped RBAC role assignment ────────────────────────────────────────────────
// Same as azureGraph's ensureRbacRole but at an arbitrary scope (e.g. a storage account).

export async function ensureRbacRoleAtScope(
  account: AccountInfo,
  scope: string,
  principalId: string,
  roleName: string,
  overrideTenantId?: string,
): Promise<EnsureResult> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const roleId = RBAC_ROLE_IDS[roleName];

  const existing = await gFetch(
    token,
    ARM,
    `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${principalId}')`,
  );
  const alreadyAssigned = existing?.value?.some((a: { properties: { roleDefinitionId: string } }) =>
    a.properties.roleDefinitionId.toLowerCase().endsWith(roleId.toLowerCase()),
  );
  if (alreadyAssigned) return "exists";

  const assignmentName = await deterministicUuid(scope, roleId, principalId);
  await gFetch(token, ARM, `${scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
        principalId,
        principalType: "ServicePrincipal",
      },
    }),
  });
  return "created";
}

export function storageAccountScope(subscriptionId: string, resourceGroup: string, storageAccountName: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}`;
}
