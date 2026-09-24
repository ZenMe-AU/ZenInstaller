import { getOboToken } from "./obo.js";
import { Forbidden, InternalError } from "../error/index.js";
import { webPubSubResourceId } from "./webPubSub.js";

const ROLES = {
  "Web PubSub Service Owner": { id: "12cf5a90-567b-43ae-8102-96cf46c7d9b4", scope: webPubSubResourceId },
};

const ARM = "https://management.azure.com";
const ARM_SCOPES = ["https://management.azure.com/.default"];

// Safe unverified: the OBO exchange above only succeeds for a token Entra has already vouched for.
function callerObjectId(userToken) {
  try {
    const [, payload] = userToken.split(".");
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).oid ?? null;
  } catch {
    return null;
  }
}

export async function hasRoleAtScope(userToken, scope, roleId) {
  const oid = callerObjectId(userToken);
  if (!oid) throw InternalError({ meta: { reason: "caller_object_id_missing" } });

  const token = await getOboToken(userToken, ARM_SCOPES);
  const path = `${scope}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&$filter=assignedTo('${oid}')`;
  const res = await fetch(`${ARM}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw InternalError({ meta: { reason: "role_assignment_lookup_failed", status: res.status } });
  }

  const data = await res.json();
  const granted = (data?.value ?? []).map((a) => a.properties?.roleDefinitionId ?? "");
  const matched = granted.some((id) => id.toLowerCase().endsWith(roleId.toLowerCase()));
  // Names the roles actually held, since "no match" on its own says nothing about why.
  if (!matched) console.warn("No match for role", roleId, "at", scope, "— caller holds:", granted);
  return matched;
}

export async function assertRoles(userToken, roleNames) {
  for (const name of roleNames) {
    const role = ROLES[name];
    if (!role) throw InternalError({ meta: { reason: "unknown_role", role: name } });

    const scope = role.scope();
    if (!scope) throw InternalError({ meta: { reason: "resource_id_unresolved", role: name } });

    const hasRole = await hasRoleAtScope(userToken, scope, role.id);
    console.log(`Checking role "${name}" at scope "${scope}" — hasRole:`, hasRole);
    if (!hasRole) {
      throw Forbidden({ meta: { reason: "insufficient_permissions", role: name } });
    }
  }
}
