import type { PipelineConfig } from "../types";
import { GRAPH_PERMISSIONS } from "../config/azureConfig";
import { AZURE_VARIABLE_KEYS, C01_KEYS } from "./variables";

export const PIPELINES: Record<string, PipelineConfig> = {
  costManagement: {
    workflowId: "planChanges.yml",
    label: "ZenInstaller Cost Management",
    templateRepo: "ZenMe-AU/ZBCorpArchitecture",
    validEnvs: ["PROD", "TEST"] as const,
    stages: [
      {
        key: "c01",
        label: "c01subscription",
        azurePermissions: [],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          {
            type: "stageVar",
            keys: C01_KEYS,
            label: "c01 variables",
            descriptions: {
              CONTACT_EMAILS: "Multiple emails — separate with a comma, e.g. alice@example.com,bob@example.com",
            },
          },
        ],
      },
    ],
  },
};

export function matchPipelineByTemplate(templateName: string): string | null {
  const entry = Object.entries(PIPELINES).find(([, cfg]) => cfg.templateRepo === templateName);
  return entry ? entry[0] : null;
}
