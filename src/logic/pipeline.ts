import type { PipelineConfig } from "../types";
import { AZURE_VARIABLE_KEYS, AWS_VARIABLE_KEYS, C01_KEYS } from "./variables";

export const PIPELINES: Record<string, PipelineConfig> = {
  corpSetup: {
    workflowId: "planChanges.yml",
    label: "ZenInstaller Setup Central Corp Environment",
    templateRepo: "ZenMe-AU/ZBCorpArchitecture",
    stages: [
      {
        key: "c01",
        label: "c01subscription",
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
      {
        key: "c02",
        label: "c02globalGroups",
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c05",
        label: "c05rootrg",
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c07",
        label: "c07userAccounts",
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c20",
        label: "c20awsentrasso",
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c21",
        label: "c21awsentrassoP2",
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
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
        ],
      },
    ],
  },
  // Add future pipelines here — no other files need to change
};

export function matchPipelineByTemplate(templateName: string): string | null {
  const entry = Object.entries(PIPELINES).find(([, cfg]) => cfg.templateRepo === templateName);
  return entry ? entry[0] : null;
}
