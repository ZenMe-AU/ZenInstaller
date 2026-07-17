import type { PipelineConfig } from "../types";
import { GRAPH_PERMISSIONS } from "../config/azureConfig";
import { AZURE_VARIABLE_KEYS, AWS_VARIABLE_KEYS } from "./variables";

export const PIPELINES: Record<string, PipelineConfig> = {
  awsHosting: {
    workflowId: "planChanges.yml",
    label: "ZenInstaller AWS Hosting",
    templateRepo: "ZenMe-AU/ZBCorpArchitecture",
    validEnvs: ["PROD", "TEST"] as const,
    stages: [
      {
        key: "c20",
        label: "c20awsentrasso",
        azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c21",
        label: "c21awsentrassoP2",
        azurePermissions: [GRAPH_PERMISSIONS.AppRoleAssignmentReadWriteAll, GRAPH_PERMISSIONS.PolicyReadWriteApplicationConfiguration],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
        ],
      },
      {
        key: "c25",
        label: "c25cloudfront",
        azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
        ],
      },
    ],
  },
};

export function matchPipelineByTemplate(templateName: string): string | null {
  const entry = Object.entries(PIPELINES).find(([, cfg]) => cfg.templateRepo === templateName);
  return entry ? entry[0] : null;
}
