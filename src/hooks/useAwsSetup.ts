import { useState } from "react";
import { createGithubRole } from "../api/aws";

export function useAwsSetup({
  org,
  repo,
  validEnvs,
}: {
  org: string;
  repo: string;
  validEnvs: readonly string[];
}) {
  const defaultEnvs = ["PROD", "TEST"].filter((e) => validEnvs.includes(e));
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [roleName, setRoleName] = useState("zeninstaller-github");
  const [environments, setEnvironments] = useState<string[]>(defaultEnvs.length > 0 ? defaultEnvs : [...validEnvs]);
  const [createOidcProvider, setCreateOidcProvider] = useState(true);
  const [loading, setLoading] = useState(false);
  const [roleArn, setRoleArn] = useState<string | null>(null);
  const [wasUpdated, setWasUpdated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleEnv = (env: string) =>
    setEnvironments((prev) => (prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]));

  const canCreate =
    !!accessKeyId.trim() && !!secretAccessKey.trim() && !!roleName.trim() && environments.length > 0 && !!org && !!repo;

  const create = async () => {
    setLoading(true);
    setError(null);
    try {
      const { roleArn: arn, updated } = await createGithubRole({ accessKeyId, secretAccessKey, org, repo, environments, roleName, createOidcProvider });
      setRoleArn(arn);
      setWasUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return {
    accessKeyId,
    setAccessKeyId,
    secretAccessKey,
    setSecretAccessKey,
    roleName,
    setRoleName,
    environments,
    setEnvironments,
    toggleEnv,
    createOidcProvider,
    setCreateOidcProvider,
    loading,
    roleArn,
    wasUpdated,
    error,
    canCreate,
    create,
  };
}
