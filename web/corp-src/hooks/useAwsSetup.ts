import { useState, useRef, useEffect, useCallback } from "react";
import { createOrUpdateGithubOidcRole, ensureGithubOidcProvider, getAwsCallerIdentity, getAwsMfaDevices, getAwsSessionCredentials } from "../api/aws";
import type { AwsCallerIdentity, AwsMfaDevice, AwsSessionCredentials } from "../api/aws";
import { SESSION_DURATION_MS, SESSION_REFRESH_LEAD_MS } from "../config/awsConfig";

export type StepStatus = "pending" | "running" | "done" | "skipped" | "error";
export type SetupStep = { id: string; label: string; status: StepStatus; detail?: string };

// Persists only the short-lived exchanged session credentials (expire within
// SESSION_DURATION_SECONDS) — never the user's long-term access key/secret — so a
// page refresh keeps the user signed in until that token naturally expires.
const SESSION_STORAGE_KEY = "zeninstaller_aws_session";

type PersistedAwsSession = {
  identity: AwsCallerIdentity;
  mfaDevices: AwsMfaDevice[];
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: string };
};

function saveAwsSession(identity: AwsCallerIdentity, mfaDevices: AwsMfaDevice[], creds: AwsSessionCredentials) {
  if (!creds.expiration) return; // no expiry to bound the persisted lifetime by — don't persist indefinitely
  const payload: PersistedAwsSession = {
    identity,
    mfaDevices,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration.toISOString(),
    },
  };
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
}

function loadAwsSession(): PersistedAwsSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedAwsSession;
    if (new Date(parsed.credentials.expiration).getTime() <= Date.now()) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearAwsSession() {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export function useAwsSetup({ org, repo, validEnvs }: { org: string; repo: string; validEnvs: readonly string[] }) {
  const defaultEnvs = ["PROD", "TEST"].filter((e) => validEnvs.includes(e));
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [roleName, setRoleName] = useState("zeninstaller-github");
  const [environments, setEnvironments] = useState<string[]>(defaultEnvs.length > 0 ? defaultEnvs : [...validEnvs]);

  // Restored once on mount from any still-valid persisted session (see loadAwsSession).
  const [restoredSession] = useState(loadAwsSession);

  // ── Sign-in phase ──
  const [identity, setIdentity] = useState<AwsCallerIdentity | null>(restoredSession?.identity ?? null);
  const [mfaDevices, setMfaDevices] = useState<AwsMfaDevice[]>(restoredSession?.mfaDevices ?? []);
  const [selectedMfaSerial, setSelectedMfaSerial] = useState<string | null>(null);
  const [mfaTokenCode, setMfaTokenCode] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Session-credential cache (the token exchanged from the user's AWS keys).
  const [sessionValidUntil, setSessionValidUntil] = useState<number | null>(
    restoredSession ? new Date(restoredSession.credentials.expiration).getTime() : null,
  );
  const sessionCredsRef = useRef<AwsSessionCredentials | null>(
    restoredSession ? { ...restoredSession.credentials, expiration: new Date(restoredSession.credentials.expiration) } : null,
  );

  // ── Role-creation phase ──
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [roleArn, setRoleArn] = useState<string | null>(null);
  const [wasUpdated, setWasUpdated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateStep = useCallback((id: string, status: StepStatus, detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  }, []);

  const signedIn = sessionValidUntil !== null && sessionValidUntil > Date.now();
  const usableMfa = mfaDevices.filter((d) => d.usable);
  const needsMfa = identity !== null && usableMfa.length > 0 && !signedIn;
  // Only FIDO security keys enrolled — unusable for STS, so we can't prompt for a code.
  const fidoOnly = identity !== null && mfaDevices.length > 0 && usableMfa.length === 0;

  const resetSession = () => {
    sessionCredsRef.current = null;
    setSessionValidUntil(null);
    setIdentity(null);
    setMfaDevices([]);
    setSelectedMfaSerial(null);
    setMfaTokenCode("");
    setSignInError(null);
    setSteps([]);
    setRoleArn(null);
    setWasUpdated(null);
    setError(null);
    clearAwsSession();
  };

  // Clears a finished/failed run so the role-name form reappears (the "↩ Try again" action).
  const resetRoleCreation = () => {
    setSteps([]);
    setRoleArn(null);
    setWasUpdated(null);
    setError(null);
  };

  // Editing the credentials invalidates the whole sign-in session — but skip the very
  // first run, which always fires on mount and would otherwise wipe out a session just
  // restored above before the user has touched either field.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    resetSession();
  }, [accessKeyId, secretAccessKey]);

  const toggleEnv = (env: string) => setEnvironments((prev) => (prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]));

  const canSignIn = !!accessKeyId.trim() && !!secretAccessKey.trim() && (!needsMfa || !!mfaTokenCode.trim());
  const canCreate = signedIn && !!roleName.trim() && environments.length > 0 && !!org && !!repo;

  // Near expiry: silently re-exchange when no TOTP MFA was used (the long-term keys are
  // still in memory); MFA sessions can't refresh without a fresh one-time code, so we
  // clear the session — needsMfa flips true and the code field re-appears.
  useEffect(() => {
    if (sessionValidUntil === null) return;
    const isMfa = mfaDevices.some((d) => d.usable);
    const lead = isMfa ? 0 : SESSION_REFRESH_LEAD_MS;
    const delay = Math.max(0, sessionValidUntil - Date.now() - lead);
    const timer = setTimeout(async () => {
      if (isMfa) {
        sessionCredsRef.current = null;
        setSessionValidUntil(null);
        clearAwsSession();
        return;
      }
      try {
        const creds = await getAwsSessionCredentials(accessKeyId.trim(), secretAccessKey.trim());
        sessionCredsRef.current = creds;
        setSessionValidUntil(creds.expiration ? creds.expiration.getTime() : Date.now() + SESSION_DURATION_MS);
        if (identity) saveAwsSession(identity, mfaDevices, creds);
      } catch {
        sessionCredsRef.current = null;
        setSessionValidUntil(null);
        clearAwsSession();
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [sessionValidUntil, mfaDevices, accessKeyId, secretAccessKey, identity]);

  // Exchange session credentials. Attaches MFA only when a usable (TOTP) device is
  // selected and a code is entered; otherwise exchanges plain session credentials.
  // Takes identity/devices explicitly rather than reading them off state — during the
  // very first sign-in they were just set via setIdentity/setMfaDevices in this same
  // call, and React hasn't re-rendered yet, so the state closure is still stale.
  const exchangeSession = async (forIdentity: AwsCallerIdentity, forDevices: AwsMfaDevice[]) => {
    const mfa = selectedMfaSerial && mfaTokenCode.trim() ? { serialNumber: selectedMfaSerial, tokenCode: mfaTokenCode.trim() } : undefined;
    const creds = await getAwsSessionCredentials(accessKeyId.trim(), secretAccessKey.trim(), mfa);
    sessionCredsRef.current = creds;
    setSessionValidUntil(creds.expiration ? creds.expiration.getTime() : Date.now() + SESSION_DURATION_MS);
    setMfaTokenCode(""); // token is single-use
    saveAwsSession(forIdentity, forDevices, creds);
  };

  const signIn = async () => {
    setSignInError(null);
    setSigningIn(true);
    try {
      // Phase 1 — resolve identity + MFA devices once. Stop for a code only if a usable
      // (TOTP) device is enrolled; FIDO-only or no MFA falls through to a plain exchange.
      if (!identity) {
        const [id, devices] = await Promise.all([
          getAwsCallerIdentity(accessKeyId.trim(), secretAccessKey.trim()),
          getAwsMfaDevices(accessKeyId.trim(), secretAccessKey.trim()),
        ]);
        setIdentity(id);
        setMfaDevices(devices);
        const firstUsable = devices.find((d) => d.usable);
        setSelectedMfaSerial(firstUsable?.serialNumber ?? null);
        if (firstUsable) return; // wait for the MFA code, then sign in again
        await exchangeSession(id, devices);
        return;
      }

      // Phase 2 — usable MFA in play: require a code before exchanging.
      if (usableMfa.length > 0 && !mfaTokenCode.trim()) {
        setSignInError("Enter your MFA code to continue.");
        return;
      }
      await exchangeSession(identity, mfaDevices);
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = () => resetSession();

  const create = async () => {
    if (!signedIn || !sessionCredsRef.current || !identity) {
      setError("Sign in to AWS first.");
      return;
    }
    const credentials = sessionCredsRef.current;
    setLoading(true);
    setError(null);

    const initialSteps: SetupStep[] = [
      { id: "oidc", label: "Check Identity provider", status: "pending" },
      { id: "role", label: "Create IAM role", status: "pending" },
    ];
    setSteps(initialSteps);

    let currentStep = "oidc";
    try {
      updateStep("oidc", "running");
      const { created } = await ensureGithubOidcProvider(credentials);
      updateStep("oidc", "done", created ? "Created" : "Already exists");

      currentStep = "role";
      updateStep("role", "running");
      const { roleArn: arn, updated } = await createOrUpdateGithubOidcRole(credentials, {
        accountId: identity.accountId,
        org,
        repo,
        environments,
        roleName,
      });
      updateStep("role", "done", updated ? `Existing role — merged ${environments.length} environment(s)` : "Created");
      setRoleArn(arn);
      setWasUpdated(updated);
    } catch (err) {
      updateStep(currentStep, "error", err instanceof Error ? err.message : "Failed");
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
    // sign-in
    identity,
    mfaDevices,
    selectedMfaSerial,
    setSelectedMfaSerial,
    mfaTokenCode,
    setMfaTokenCode,
    needsMfa,
    fidoOnly,
    signedIn,
    signingIn,
    signInError,
    canSignIn,
    signIn,
    signOut,
    // role
    roleName,
    setRoleName,
    environments,
    setEnvironments,
    toggleEnv,
    loading,
    steps,
    roleArn,
    wasUpdated,
    error,
    canCreate,
    create,
    resetRoleCreation,
  };
}
