import type { AzureTenant } from "../api/azureGraph";

// Looks up a tenant's display name in a fetched list, falling back to the raw id when unknown.
export function tenantDisplayName(tenants: AzureTenant[], tenantId: string | null | undefined): string | undefined {
  if (!tenantId) return undefined;
  return tenants.find((t) => t.tenantId === tenantId)?.displayName ?? tenantId;
}
