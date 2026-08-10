import { useState } from "react";
import type { Account, UpsertStatus } from "../../types";
import { createVariable, updateVariable } from "../../api";

export type SaveResult = {
  result: "saved" | "no-changes" | "error";
  savedKeys: string[];
  newlySaved: Record<string, string>;
};

type Params = {
  keys: readonly string[];
  /*
   * Source of truth for "what's already saved". The caller owns it — a controlled
   * prop (CompanyInfoDetail) or its own fetched state (CloudVariableDetail).
   */
  savedValues: Record<string, string>;
  account: Account | null;
  repo: string;
  envName: string | null;
  onSavedKey?: (key: string, value: string) => void; // Called once per key that saves successfully, so the caller can record it.
};

/*
 * Local/saved variable-editing core shared by the GitHub- and Azure-variables editors:
 * tracks edits, dirty state, and the save loop. Fetch/populate/auto-save stay in each caller.
 */
export function useVariableEditor({ keys, savedValues, account, repo, envName, onSavedKey }: Params) {
  const [localValues, setLocalValues] = useState<Record<string, string>>(savedValues);
  const [upsertStatuses, setUpsertStatuses] = useState<UpsertStatus[]>([]);
  const [updating, setUpdating] = useState(false);

  const isDependenciesReady = account && repo && envName;

  const dirtyKeys = keys.filter((k) => (localValues[k] ?? "") !== (savedValues[k] ?? ""));

  const onChange = (key: string, value: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const onRevert = (key: string) => {
    setLocalValues((prev) => ({ ...prev, [key]: savedValues[key] ?? "" }));
    setUpsertStatuses((prev) => prev.filter((s) => s.key !== key));
  };

  const save = async (overrideValues?: Record<string, string>): Promise<SaveResult> => {
    const vals = overrideValues ?? localValues;
    const newlySaved = { ...savedValues };
    if (!isDependenciesReady) return { result: "error", savedKeys: [], newlySaved };
    const dirty = keys.filter((k) => (vals[k] ?? "") !== (savedValues[k] ?? ""));
    if (dirty.length === 0) return { result: "no-changes", savedKeys: [], newlySaved };

    setUpdating(true);
    const statuses: UpsertStatus[] = [];
    let hasError = false;
    for (const key of dirty) {
      const value = vals[key] ?? "";
      const isNew = !savedValues[key];
      try {
        await (isNew ? createVariable : updateVariable)(account, repo, key, value, envName);
        statuses.push({ key, status: "success" });
        newlySaved[key] = value;
        onSavedKey?.(key, value);
      } catch (e) {
        console.error(`Failed to ${isNew ? "create" : "update"} variable "${key}":`, e);
        statuses.push({ key, status: "error", error: "Save failed" });
        hasError = true;
      }
    }
    setUpsertStatuses(statuses);
    setUpdating(false);
    const savedKeys = statuses.filter((s) => s.status === "success").map((s) => s.key);
    return { result: hasError ? "error" : "saved", savedKeys, newlySaved };
  };

  return { localValues, setLocalValues, upsertStatuses, setUpsertStatuses, updating, dirtyKeys, onChange, onRevert, save };
}
