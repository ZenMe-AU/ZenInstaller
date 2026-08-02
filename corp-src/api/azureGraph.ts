import type { AccountInfo } from "@azure/msal-browser";
import { getMsal } from "./msal";
import { APP_SCOPES, LOGIN_SCOPES, ARM_SCOPES, DOMAIN_SCOPES, GRANT_CONSENT_SCOPES, ACCESS_PASS_SCOPES } from "../config/azureConfig";
import { RBAC_ROLE_IDS } from "../config/azureConfig";
import { deterministicUuid } from "../logic/crypto";
import { getFederatedCredentialName } from "../logic/naming";

const GRAPH = "https://graph.microsoft.com/v1.0";
const ARM = "https://management.azure.com";

// ── Token helpers ──────────────────────────────────────────────────────────────

export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"; // Microsoft consumer tenant (MSA accounts)

/*
 * overrideTenantId is used for MSA accounts to target a specific AAD tenant
 * for BOTH Graph and ARM calls (MSA consumer directory doesn't support app management)
 */
export async function getToken(account: AccountInfo, scopes: string[], overrideTenantId?: string): Promise<string> {
  const msal = await getMsal();
  if (!msal) throw new Error("MSAL not configured");

  const isArm = scopes.some((s) => s.includes("management.azure.com"));
  if (isArm && account.tenantId === MSA_TENANT && !overrideTenantId) {
    throw new Error("MSA_NEEDS_TENANT");
  }

  /*
   * Always use a tenant-specific authority to avoid consumer token issues — overrideTenantId
   * takes precedence, else the account's tenantId, skipped for the MSA consumer tenant.
   */
  const tenant = overrideTenantId ?? account.tenantId;
  const authority = tenant !== MSA_TENANT ? `https://login.microsoftonline.com/${tenant}` : undefined;

  const res = await msal.acquireTokenSilent({
    scopes,
    account,
    ...(authority ? { authority } : {}),
  });
  return res.accessToken;
}

export async function gFetch(token: string, base: string, path: string, options?: RequestInit) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

export type Subscription = { id: string; displayName: string; tenantId: string };

/*
 * ARM's /subscriptions returns every subscription the signed-in identity can access —
 * including ones in OTHER tenants (via guest access or Lighthouse cross-tenant delegation)
 * — regardless of which tenant's authority the token was acquired against. Filter to the
 * tenant actually being targeted, so e.g. a guest account doesn't see subscriptions from
 * a different tenant mixed into this one's picker.
 */
export async function listSubscriptions(account: AccountInfo, overrideTenantId?: string): Promise<Subscription[]> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const data = await gFetch(token, ARM, "/subscriptions?api-version=2020-01-01");
  const targetTenantId = overrideTenantId || account.tenantId;
  return (data.value ?? [])
    .map((s: { subscriptionId: string; displayName: string; tenantId: string }) => ({
      id: s.subscriptionId,
      displayName: s.displayName,
      tenantId: s.tenantId,
    }))
    .filter((s: Subscription) => s.tenantId === targetTenantId);
}

// ── Tenants ──────────────────────────────────────────────────────────────────────

export type AzureTenant = { tenantId: string; displayName: string; defaultDomain?: string };

/*
 * Lists tenants the signed-in identity can access. Needs an ARM token, so it throws
 * MSA_NEEDS_TENANT for personal accounts before a tenant is chosen — callers fall back to
 * the tenant IDs the account already exposes (AccountInfo.tenantProfiles).
 */
export async function listTenants(account: AccountInfo, overrideTenantId?: string): Promise<AzureTenant[]> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const data = await gFetch(token, ARM, "/tenants?api-version=2022-12-01");
  return (data.value ?? []).map((t: { tenantId: string; displayName?: string; defaultDomain?: string }) => ({
    tenantId: t.tenantId,
    displayName: t.displayName || t.defaultDomain || t.tenantId,
    defaultDomain: t.defaultDomain,
  }));
}

// ── App registration ───────────────────────────────────────────────────────────

export async function getExistingApp(
  account: AccountInfo,
  displayName: string,
  overrideTenantId?: string,
): Promise<{ appId: string; id: string } | null> {
  const token = await getToken(account, APP_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/applications?$filter=displayName eq '${displayName}'&$select=appId,id`);
  return data.value?.[0] ? { appId: data.value[0].appId, id: data.value[0].id } : null;
}

// Reverse lookup: resolve an app registration's display name from its client (app) id.
export async function getAppNameByAppId(account: AccountInfo, appId: string, overrideTenantId?: string): Promise<string | null> {
  const token = await getToken(account, APP_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/applications?$filter=appId eq '${appId}'&$select=displayName`);
  return data.value?.[0]?.displayName ?? null;
}

export async function createAppRegistration(
  account: AccountInfo,
  displayName: string,
  permissions: readonly string[],
  overrideTenantId?: string,
): Promise<{ appId: string; id: string }> {
  const token = await getToken(account, APP_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, "/applications", {
    method: "POST",
    body: JSON.stringify({
      displayName,
      signInAudience: "AzureADMyOrg",
      requiredResourceAccess: [
        {
          resourceAppId: "00000003-0000-0000-c000-000000000000",
          resourceAccess: permissions.map((id) => ({ id, type: "Role" })),
        },
      ],
    }),
  });
  return { appId: data.appId, id: data.id };
}

// ── Service principal ──────────────────────────────────────────────────────────

export async function getExistingSP(account: AccountInfo, appId: string, overrideTenantId?: string): Promise<{ id: string } | null> {
  const token = await getToken(account, APP_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/servicePrincipals?$filter=appId eq '${appId}'&$select=id`);
  return data.value?.[0] ? { id: data.value[0].id } : null;
}

export async function createServicePrincipal(account: AccountInfo, appId: string, overrideTenantId?: string): Promise<{ id: string }> {
  const token = await getToken(account, APP_SCOPES, overrideTenantId);
  const res = await fetch(`${GRAPH}/servicePrincipals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ appId }),
  });
  if (res.status === 409) {
    // SP already exists — fetch it
    const existing = await getExistingSP(account, appId, overrideTenantId);
    if (existing) return existing;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} /servicePrincipals: ${body}`);
  }
  const data = await res.json();
  return { id: data.id };
}

// ── Federated credentials ──────────────────────────────────────────────────────

export async function ensureFederatedCredential(
  account: AccountInfo,
  appObjectId: string,
  org: string,
  repo: string,
  environment: string,
  overrideTenantId?: string,
): Promise<void> {
  const subject = `repo:${org}/${repo}:environment:${environment}`;
  const credName = getFederatedCredentialName(org, repo, environment);
  const token = await getToken(account, APP_SCOPES, overrideTenantId);
  const existing = await gFetch(token, GRAPH, `/applications/${appObjectId}/federatedIdentityCredentials`);
  if (existing?.value?.some((c: { subject: string }) => c.subject === subject)) return;
  await gFetch(token, GRAPH, `/applications/${appObjectId}/federatedIdentityCredentials`, {
    method: "POST",
    body: JSON.stringify({
      name: credName,
      issuer: "https://token.actions.githubusercontent.com",
      subject,
      audiences: ["api://AzureADTokenExchange"],
    }),
  });
}

// ── RBAC roles (ARM) ──────────────────────────────────────────────────────────

// Whether the principal already holds `roleName` on the subscription (read-only check).
export async function hasRbacRole(
  account: AccountInfo,
  subscriptionId: string,
  principalId: string,
  roleName: string,
  overrideTenantId?: string,
): Promise<boolean> {
  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const roleId = RBAC_ROLE_IDS[roleName];
  const existing = await gFetch(
    token,
    ARM,
    `/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${principalId}')`,
  );
  return !!existing?.value?.some((a: { properties: { roleDefinitionId: string } }) =>
    a.properties.roleDefinitionId.toLowerCase().endsWith(roleId.toLowerCase()),
  );
}

export async function ensureRbacRole(
  account: AccountInfo,
  subscriptionId: string,
  spObjectId: string,
  roleName: string,
  overrideTenantId?: string,
): Promise<void> {
  if (await hasRbacRole(account, subscriptionId, spObjectId, roleName, overrideTenantId)) return;

  const token = await getToken(account, ARM_SCOPES, overrideTenantId);
  const scope = `/subscriptions/${subscriptionId}`;
  const roleId = RBAC_ROLE_IDS[roleName];
  const assignmentName = await deterministicUuid(scope, roleId, spObjectId);
  await gFetch(token, ARM, `${scope}/providers/Microsoft.Authorization/roleAssignments/${assignmentName}?api-version=2022-04-01`, {
    method: "PUT",
    body: JSON.stringify({
      properties: {
        roleDefinitionId: `/providers/Microsoft.Authorization/roleDefinitions/${roleId}`,
        principalId: spObjectId,
        principalType: "ServicePrincipal",
      },
    }),
  });
}

// ── Admin consent ──────────────────────────────────────────────────────────────

export async function grantAdminConsent(
  account: AccountInfo,
  spObjectId: string,
  permissions: readonly string[],
  overrideTenantId?: string,
): Promise<void> {
  const token = await getToken(account, GRANT_CONSENT_SCOPES, overrideTenantId);

  const graphSP = await gFetch(token, GRAPH, "/servicePrincipals?$filter=appId eq '00000003-0000-0000-c000-000000000000'&$select=id");
  const graphSpId = graphSP?.value?.[0]?.id;
  if (!graphSpId) throw new Error("Microsoft Graph service principal not found in tenant");

  for (const permId of permissions) {
    await gFetch(token, GRAPH, `/servicePrincipals/${spObjectId}/appRoleAssignments`, {
      method: "POST",
      body: JSON.stringify({ principalId: spObjectId, resourceId: graphSpId, appRoleId: permId }),
    }).catch((err: Error) => {
      if (!err.message.includes("already exists") && !err.message.includes("409")) throw err;
    });
  }
}

// ── Revoke delegated permission grants ────────────────────────────────────────

export async function revokeOAuth2Grants(account: AccountInfo, appClientId: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, APP_SCOPES, overrideTenantId);
  const spRes = await gFetch(token, GRAPH, `/servicePrincipals?$filter=appId eq '${appClientId}'&$select=id`);
  const spId: string | undefined = spRes?.value?.[0]?.id;
  if (!spId) return;
  const grantsRes = await gFetch(token, GRAPH, `/oauth2PermissionGrants?$filter=clientId eq '${spId}'`);
  const ids: string[] = (grantsRes?.value ?? []).map((g: { id: string }) => g.id);
  await Promise.all(ids.map((id) => gFetch(token, GRAPH, `/oauth2PermissionGrants/${id}`, { method: "DELETE" }).catch(() => {})));
}

// ── Entra custom domains ──────────────────────────────────────────────────────
/*
 * All use DOMAIN_SCOPES (incremental consent) — first call may throw
 * interaction_required until the user consents to Domain.ReadWrite.All.
 */

export type EntraDomain = { id: string; isVerified: boolean; isDefault: boolean };

export async function getEntraDomain(account: AccountInfo, domainName: string, overrideTenantId?: string): Promise<EntraDomain | null> {
  const token = await getToken(account, DOMAIN_SCOPES, overrideTenantId);
  try {
    const data = await gFetch(token, GRAPH, `/domains/${domainName}`);
    return { id: data.id, isVerified: !!data.isVerified, isDefault: !!data.isDefault };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("404")) return null;
    throw err;
  }
}

export async function createEntraDomain(account: AccountInfo, domainName: string, overrideTenantId?: string): Promise<EntraDomain> {
  const token = await getToken(account, DOMAIN_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, "/domains", { method: "POST", body: JSON.stringify({ id: domainName }) });
  return { id: data.id, isVerified: !!data.isVerified, isDefault: !!data.isDefault };
}

// Returns the TXT verification token (e.g. "MS=ms12345678") for an unverified domain.
export async function getDomainVerificationTxt(account: AccountInfo, domainName: string, overrideTenantId?: string): Promise<string | null> {
  const token = await getToken(account, DOMAIN_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/domains/${domainName}/verificationDnsRecords`);
  const txt = (data.value ?? []).find((r: { recordType?: string; text?: string }) => r.recordType?.toLowerCase() === "txt");
  return txt?.text ?? null;
}

// Triggers domain verification. Throws if the DNS record hasn't propagated yet.
export async function verifyEntraDomain(account: AccountInfo, domainName: string, overrideTenantId?: string): Promise<EntraDomain> {
  const token = await getToken(account, DOMAIN_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, `/domains/${domainName}/verify`, { method: "POST", body: JSON.stringify({}) });
  return { id: data.id, isVerified: !!data.isVerified, isDefault: !!data.isDefault };
}

// Makes the domain the tenant's primary (default) domain. Requires the domain to be verified.
export async function setPrimaryEntraDomain(account: AccountInfo, domainName: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, DOMAIN_SCOPES, overrideTenantId);
  await gFetch(token, GRAPH, `/domains/${domainName}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) });
}

// ── Access Pass ─────────────────────────────────────────────────────────────────

export type EntraUser = { id: string; displayName: string; userPrincipalName: string };

export type TemporaryAccessPass = {
  id: string;
  temporaryAccessPass: string;
  startDateTime?: string;
  lifetimeInMinutes?: number;
  isUsableOnce?: boolean;
};

export type GraphAuthMethod = {
  id: string;
  "@odata.type"?: string;
};

// List Entra users managed by the signed-in user (direct reports) — populates the Access Pass user picker.
export async function listUsersManagedBySignedInUser(account: AccountInfo, overrideTenantId?: string): Promise<EntraUser[]> {
  const token = await getToken(account, ACCESS_PASS_SCOPES, overrideTenantId);
  const users = await gFetch(token, GRAPH, "/me/directReports/microsoft.graph.user?$select=id,displayName,userPrincipalName");

  return (users.value ?? [])
    .map((u: { id: string; displayName?: string; userPrincipalName?: string; mail?: string }) => ({
      id: u.id,
      displayName: u.displayName ?? u.userPrincipalName ?? u.mail ?? u.id,
      userPrincipalName: u.userPrincipalName ?? u.mail ?? "",
    }))
    .sort((a: EntraUser, b: EntraUser) => a.displayName.localeCompare(b.displayName));
}

const TAP_POLICY_PATH = "/policies/authenticationMethodsPolicy/authenticationMethodConfigurations/TemporaryAccessPass";

// Ensures the tenant's authentication methods policy allows Temporary Access Pass, enabling
// it (without touching includeTargets/excludeTargets/lifetime settings) if currently
// disabled. Returns true if it needed to be enabled, false if it already was.
export async function ensureTemporaryAccessPassEnabled(account: AccountInfo, overrideTenantId?: string): Promise<boolean> {
  const token = await getToken(account, ACCESS_PASS_SCOPES, overrideTenantId);
  const data = await gFetch(token, GRAPH, TAP_POLICY_PATH);
  if (data.state === "enabled") return false;
  await gFetch(token, GRAPH, TAP_POLICY_PATH, {
    method: "PATCH",
    body: JSON.stringify({ "@odata.type": "#microsoft.graph.temporaryAccessPassAuthenticationMethodConfiguration", state: "enabled" }),
  });
  return true;
}

export async function listUserAuthenticationMethods(account: AccountInfo, userId: string, overrideTenantId?: string): Promise<GraphAuthMethod[]> {
  const token = await getToken(account, ACCESS_PASS_SCOPES, overrideTenantId);
  // Do not use @odata.type in $select; Graph rejects it in select/expand expressions.
  const data = await gFetch(token, GRAPH, `/users/${userId}/authentication/methods`);
  return (data?.value ?? []) as GraphAuthMethod[];
}

export async function deleteUserAuthenticationMethod(account: AccountInfo, deletePath: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, ACCESS_PASS_SCOPES, overrideTenantId);
  await gFetch(token, GRAPH, deletePath, { method: "DELETE" });
}

export async function resetUserPassword(account: AccountInfo, userId: string, newPassword: string, overrideTenantId?: string): Promise<void> {
  const token = await getToken(account, ACCESS_PASS_SCOPES, overrideTenantId);
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await gFetch(token, GRAPH, `/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          passwordProfile: {
            password: newPassword,
            forceChangePasswordNextSignIn: false,
            forceChangePasswordNextSignInWithMfa: false,
          },
        }),
      });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const retryable = msg.includes("409") && (msg.includes("Directory_ConcurrencyViolation") || msg.includes("concurrent requests"));

      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      const delayMs = 400 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Creates a Temporary Access Pass for a user (requires delegated UserAuthenticationMethod.ReadWrite.All).
export async function createTemporaryAccessPassForUser(
  account: AccountInfo,
  userId: string,
  overrideTenantId?: string,
): Promise<TemporaryAccessPass> {
  const token = await getToken(account, ACCESS_PASS_SCOPES, overrideTenantId);
  const maxAttempts = 4;
  let data: {
    id: string;
    temporaryAccessPass: string;
    startDateTime?: string;
    lifetimeInMinutes?: number;
    isUsableOnce?: boolean;
  } | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      data = await gFetch(token, GRAPH, `/users/${userId}/authentication/temporaryAccessPassMethods`, {
        method: "POST",
        body: JSON.stringify({
          isUsableOnce: true,
          lifetimeInMinutes: 60,
        }),
      });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const retryable = msg.includes("409") && (msg.toLowerCase().includes("conflict") || msg.includes("concurrent requests"));

      if (!retryable || attempt === maxAttempts) {
        throw err;
      }

      const delayMs = 400 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  if (!data) {
    throw new Error("Failed to create Temporary Access Pass");
  }

  return {
    id: data.id,
    temporaryAccessPass: data.temporaryAccessPass,
    startDateTime: data.startDateTime,
    lifetimeInMinutes: data.lifetimeInMinutes,
    isUsableOnce: data.isUsableOnce,
  };
}

// Checks whether a previously-created Temporary Access Pass method still exists for a user.
export async function temporaryAccessPassMethodExists(
  account: AccountInfo,
  userId: string,
  methodId: string,
  overrideTenantId?: string,
): Promise<boolean> {
  try {
    const token = await getToken(account, ACCESS_PASS_SCOPES, overrideTenantId);
    await gFetch(token, GRAPH, `/users/${userId}/authentication/temporaryAccessPassMethods/${methodId}?$select=id`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404")) return false;
    throw err;
  }
}
