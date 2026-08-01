import type { PipelineConfig } from "../types";
import { GRAPH_PERMISSIONS } from "../config/azureConfig";
import { AZURE_VARIABLE_KEYS } from "./variables";

export const PIPELINES: Record<string, PipelineConfig> = {
  userAccess: {
    workflowId: "planChanges.yml",
    label: "ZenInstaller User Access",
    templateRepo: "ZenMe-AU/ZBCorpArchitecture",
    validEnvs: ["PROD", "TEST"] as const,
    stages: [
      {
        key: "c02",
        label: "c02globalGroups",
        azurePermissions: [
          GRAPH_PERMISSIONS.GroupReadWriteAll,
          GRAPH_PERMISSIONS.GroupMemberReadWriteAll,
        ],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c07",
        label: "c07userAccounts",
        azurePermissions: [
          GRAPH_PERMISSIONS.GroupReadWriteAll,
          GRAPH_PERMISSIONS.GroupMemberReadWriteAll,
          GRAPH_PERMISSIONS.UserReadWriteAll,
          GRAPH_PERMISSIONS.RoleManagementReadWriteDirectory,
          GRAPH_PERMISSIONS.UserAuthenticationMethodReadWriteAll,
          GRAPH_PERMISSIONS.PolicyReadWriteAuthenticationMethod,
          GRAPH_PERMISSIONS.DomainReadWriteAll,
        ],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
    ],
  },
};

export function matchPipelineByTemplate(templateName: string): string | null {
  const entry = Object.entries(PIPELINES).find(([, cfg]) => cfg.templateRepo === templateName);
  return entry ? entry[0] : null;
}
