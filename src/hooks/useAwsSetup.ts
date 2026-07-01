import { useState, useRef, useEffect } from "react";
import { createAwsIamRole } from "../api";
import { getAwsCallerIdentity, getAwsMfaDevices, getAwsSessionCredentials } from "../api/aws";
import type { AwsCallerIdentity, AwsMfaDevice, AwsSessionCredentials } from "../api/aws";
import { SESSION_DURATION_MS, SESSION_REFRESH_LEAD_MS } from "../config/awsConfig";

export function useAwsSetup({ org, repo, validEnvs }: { org: string; repo: string; validEnvs: readonly string[] }) {
  const defaultEnvs = ["PROD", "TEST"].filter((e) => validEnvs.includes(e));
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [roleName, setRoleName] = useState("zeninstaller-github");
  const [environments, setEnvironments] = useState<string[]>(defaultEnvs.length > 0 ? defaultEnvs : [...validEnvs]);
  const [createOidcProvider, setCreateOidcProvider] = useState(true);

  // ── Sign-in phase ──
  const [identity, setIdentity] = useState<AwsCallerIdentity | null>(null);
  const [mfaDevices, setMfaDevices] = useState<AwsMfaDevice[]>([]);
  const [selectedMfaSerial, setSelectedMfaSerial] = useState<string | null>(null);
  const [mfaTokenCode, setMfaTokenCode] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // Session-credential cache (the token handed to the backend).
  const [sessionValidUntil, setSessionValidUntil] = useState<number | null>(null);
  const sessionCredsRef = useRef<AwsSessionCredentials | null>(null);

  // ── Role-creation phase ──
  const [loading, setLoading] = useState(false);
  const [roleArn, setRoleArn] = useState<string | null>(null);
  const [wasUpdated, setWasUpdated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setRoleArn(null);
    setWasUpdated(null);
    setError(null);
  };

  // Editing the credentials invalidates the whole sign-in session.
  useEffect(() => {
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
        return;
      }
      try {
        const creds = await getAwsSessionCredentials(accessKeyId.trim(), secretAccessKey.trim());
        sessionCredsRef.current = creds;
        setSessionValidUntil(creds.expiration ? creds.expiration.getTime() : Date.now() + SESSION_DURATION_MS);
      } catch {
        sessionCredsRef.current = null;
        setSessionValidUntil(null);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [sessionValidUntil, mfaDevices, accessKeyId, secretAccessKey]);

  // Exchange session credentials. Attaches MFA only when a usable (TOTP) device is
  // selected and a code is entered; otherwise exchanges plain session credentials.
  const exchangeSession = async () => {
    const mfa = selectedMfaSerial && mfaTokenCode.trim() ? { serialNumber: selectedMfaSerial, tokenCode: mfaTokenCode.trim() } : undefined;
    const creds = await getAwsSessionCredentials(accessKeyId.trim(), secretAccessKey.trim(), mfa);
    sessionCredsRef.current = creds;
    setSessionValidUntil(creds.expiration ? creds.expiration.getTime() : Date.now() + SESSION_DURATION_MS);
    setMfaTokenCode(""); // token is single-use
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
        await exchangeSession();
        return;
      }

      // Phase 2 — usable MFA in play: require a code before exchanging.
      if (usableMfa.length > 0 && !mfaTokenCode.trim()) {
        setSignInError("Enter your MFA code to continue.");
        return;
      }
      await exchangeSession();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  };

  const signOut = () => resetSession();

  const create = async () => {
    if (!signedIn || !sessionCredsRef.current) {
      setError("Sign in to AWS first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { roleArn: arn, updated } = await createAwsIamRole({
        credentials: sessionCredsRef.current,
        org,
        repo,
        environments,
        roleName,
        createOidcProvider,
      });
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
