import type { PipelineConfig } from "./types";
import { AZURE_VARIABLE_KEYS, AWS_VARIABLE_KEYS } from "./types";

export const PIPELINES: Record<string, PipelineConfig> = {
  corpSetup: {
    workflowId: "planChanges.yml",
    label: "Corp Setup",
    templateRepo: "ZenMe-AU/ZBCorpArchitecture",
    stages: [
      {
        key: "c01",
        label: "c01subscription",
        prerequisites: [
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "var", key: "NAME" },
        ],
      },
      {
        key: "c02",
        label: "c02globalGroups",
        prerequisites: [
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "var", key: "NAME" },
        ],
      },
      {
        key: "c05",
        label: "c05rootrg",
        prerequisites: [
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
        ],
      },
      {
        key: "c07",
        label: "c07userAccounts",
        prerequisites: [
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
        ],
      },
      {
        key: "c20",
        label: "c20awsentrasso",
        prerequisites: [
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
        ],
      },
      {
        key: "c21",
        label: "c21awsentrassoP2",
        prerequisites: [
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
        ],
      },
      {
        key: "c25",
        label: "c25cloudfront",
        prerequisites: [
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
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
