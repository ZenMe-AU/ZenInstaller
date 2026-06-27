import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { useAzureAccessPass, SetupStep } from "../hooks/useAccessPass";
import { CLOUD_DOCS } from "../config/docsConfig";

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const labelSx = { fontSize: "0.68rem", color: "#94a3b8", textTransform: "uppercase" as const, letterSpacing: "0.08em", ...mono };

function StepRow({ step }: { step: SetupStep }) {
  const icon =
    step.status === "done" ? (
      <CheckCircleOutlineIcon sx={{ fontSize: 14, color: "#22c55e" }} />
    ) : step.status === "error" ? (
      <ErrorOutlineIcon sx={{ fontSize: 14, color: "#ef4444" }} />
    ) : step.status === "running" ? (
      <CircularProgress size={12} sx={{ color: "#2563eb" }} />
    ) : (
      <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: "#cbd5e1" }} />
    );

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "18px 1fr", alignItems: "start", py: 0.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", height: "1.2em" }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontSize: "0.78rem", color: step.status === "error" ? "#ef4444" : "#475569", ...mono }}>{step.label}</Typography>
        {step.detail && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.25 }}>{step.detail}</Typography>}
      </Box>
    </Box>
  );
}

function CopyRow({ label, value, masked = false }: { label: string; value: string; masked?: boolean }) {
  const [copied, setCopied] = useState(false);
  const displayValue = masked ? "*".repeat(Math.max(value.length, 12)) : value;
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
      <Typography sx={{ ...labelSx, minWidth: 180 }}>{label}</Typography>
      <Typography sx={{ fontSize: "0.78rem", color: "#1e293b", ...mono, flex: 1, wordBreak: "break-all" }}>{displayValue}</Typography>
      <Button size="small" onClick={copy} sx={{ minWidth: 0, p: 0.5, color: "#94a3b8", "&:hover": { color: "#2563eb" } }}>
        <ContentCopyIcon sx={{ fontSize: 13 }} />
        <Typography sx={{ fontSize: "0.65rem", ml: 0.5, ...mono }}>{copied ? "Copied" : "Copy"}</Typography>
      </Button>
    </Box>
  );
}

type Props = ReturnType<typeof useAzureAccessPass> & {
  disabled: boolean;
  validEnvs: readonly string[];
  onComplete: (done: boolean) => void;
};

export default function AzureAccessPassCard({
  azureAccount,
  appName,
  steps,
  result,
  running,
  loggingIn,
  consentFailed,
  loginError,
  subsError,
  needsTenantId,
  availableTenants,
  manualTenantId,
  setManualTenantId,
  tenantIdError,
  confirmTenantId,
  managerUsers,
  selectedManagerUserId,
  managerUsersLoading,
  managerUsersError,
  login,
  logout,
  reset,
  runForUser,
  changeTenant,
  disabled,
}: Props) {
  const PAGE_SIZE = 15;
  const [creatingUserId, setCreatingUserId] = useState<string | null>(null);
  const [passValuesByUserId, setPassValuesByUserId] = useState<Record<string, string>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(managerUsers.length / PAGE_SIZE)), [managerUsers.length]);
  const pagedUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return managerUsers.slice(start, start + PAGE_SIZE);
  }, [currentPage, managerUsers]);
  const visiblePages = useMemo(() => {
    const windowSize = 5;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + windowSize - 1);
    if (end - start + 1 < windowSize) {
      start = Math.max(1, end - windowSize + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (!result?.targetUserId || !result.accessPassValue) return;
    setPassValuesByUserId((prev) => ({ ...prev, [result.targetUserId!]: result.accessPassValue }));
  }, [result]);

  const handleCreateForUser = async (userId: string) => {
    setCreatingUserId(userId);
    try {
      const created = await runForUser(userId);
      if (created?.targetUserId && created.accessPassValue) {
        setPassValuesByUserId((prev) => ({ ...prev, [created.targetUserId!]: created.accessPassValue }));
      }
    } finally {
      setCreatingUserId(null);
    }
  };

  const goToPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isNaN(parsed)) return;
    const target = Math.min(totalPages, Math.max(1, parsed));
    setCurrentPage(target);
  };

  // Determine if the current result corresponds to the selected Entra user, so we can show the access pass value only for that user.
  const showingSelectedUserPass = !!result && !!selectedManagerUserId && result.targetUserId === selectedManagerUserId;
  const hydratedSelectedUserSteps: SetupStep[] =
    showingSelectedUserPass && steps.length === 0
      ? [{ id: "tap", label: "Create Temporary Access Pass", status: "done", detail: "Temporary Access Pass created" }]
      : steps;
  const showingSelectedUserSteps = hydratedSelectedUserSteps.length > 0 && (running || showingSelectedUserPass);

  return (
    <>
      {/* ── Not signed in ── */}
      {!azureAccount && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {loggingIn ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: "#2563eb" }} />
              <Typography sx={{ fontSize: "0.72rem", color: "#64748b", ...mono }}>Checking session...</Typography>
            </Box>
          ) : (
            <>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography sx={{ fontSize: "0.72rem", color: "#94a3b8", ...mono }}>Don't have an account?</Typography>
                <Box
                  component="a"
                  href={CLOUD_DOCS.azure.createAccount}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "#64748b", textDecoration: "none", "&:hover": { color: "#2563eb" } }}
                >
                  <Typography sx={{ fontSize: "0.72rem", ...mono }}>How to Create a Free Azure Account</Typography>
                  <OpenInNewIcon sx={{ fontSize: 12 }} />
                </Box>
              </Box>
              <Button
                variant="contained"
                onClick={login}
                disabled={disabled}
                sx={{
                  alignSelf: "flex-start",
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  textTransform: "none",
                  ...mono,
                  fontSize: "0.85rem",
                  py: 1,
                  px: 2.5,
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px #2563eb33",
                  "&:hover": { background: "linear-gradient(135deg, #1d4ed8, #1e40af)", boxShadow: "0 4px 12px #2563eb44" },
                  "&.Mui-disabled": { background: "#f1f5f9", color: "#cbd5e1" },
                }}
              >
                Connect Azure
              </Button>
            </>
          )}
          {loginError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{loginError}</Typography>}
        </Box>
      )}

      {/* ── Signed in ── */}
      {azureAccount && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Account info */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
              Signed in as{" "}
              <Box component="span" sx={{ fontWeight: 600, ...mono }}>
                {azureAccount.username}
              </Box>
            </Typography>
            <Button
              size="small"
              onClick={logout}
              sx={{ minWidth: 0, fontSize: "0.68rem", color: "#94a3b8", textTransform: "none", ...mono, py: 0.25, "&:hover": { color: "#ef4444" } }}
            >
              Sign out
            </Button>
          </Box>

          {/* Tenant selection required first for personal Microsoft accounts */}
          {needsTenantId && (
            <Box
              sx={{
                background: "#fef9c3",
                border: "1px solid #fde047",
                borderRadius: "8px",
                px: 2,
                py: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>Personal Microsoft account detected</Typography>
                <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono, mt: 0.25 }}>
                  Enter your Azure Tenant ID to continue. Find it at: Entra ID → Overview → Tenant ID.
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexDirection: "column" }}>
                <Autocomplete
                  freeSolo
                  options={availableTenants}
                  inputValue={manualTenantId}
                  onInputChange={(_, v) => setManualTenantId(v)}
                  sx={{ minWidth: 420 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      onKeyDown={(e) => e.key === "Enter" && confirmTenantId()}
                      inputProps={{ ...params.inputProps, style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem" } }}
                      error={!!tenantIdError}
                      helperText={tenantIdError}
                    />
                  )}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={confirmTenantId}
                  sx={{ background: "#d97706", textTransform: "none", ...mono, fontSize: "0.78rem", "&:hover": { background: "#b45309" } }}
                >
                  Load tenant
                </Button>
              </Box>
            </Box>
          )}

          {/* Entra user selector */}
          {!needsTenantId && (
            <Box
              sx={{
                background: "#fef9c3",
                border: "1px solid #fde047",
                borderRadius: "8px",
                px: 2,
                py: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>Select Entra user</Typography>
                <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono, mt: 0.25 }}>
                  Choose a user and create an access pass directly from the table.
                </Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexDirection: "column", width: "100%" }}>
                {managerUsersLoading && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={14} sx={{ color: "#d97706" }} />
                    <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono }}>Loading users...</Typography>
                  </Box>
                )}

                {!managerUsersLoading && managerUsers.length > 0 && (
                  <TableContainer sx={{ border: "1px solid #fde68a", borderRadius: "8px", background: "#fffef3", width: "100%", overflowX: "auto" }}>
                    <Table size="small" sx={{ minWidth: 640 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ ...mono, fontSize: "0.68rem", color: "#92400e", fontWeight: 700 }}>Name</TableCell>
                          <TableCell sx={{ ...mono, fontSize: "0.68rem", color: "#92400e", fontWeight: 700 }}>UPN</TableCell>
                          <TableCell align="right" sx={{ ...mono, fontSize: "0.68rem", color: "#92400e", fontWeight: 700 }}>Action</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pagedUsers.map((user) => {
                          const isCurrentResult = result?.targetUserId === user.id;
                          const isCreatingThisUser = creatingUserId === user.id && running;
                          const savedPass = passValuesByUserId[user.id];
                          return (
                            <Fragment key={user.id}>
                              <TableRow sx={isCurrentResult ? { background: "#f0fdf4" } : undefined}>
                                <TableCell sx={{ ...mono, fontSize: "0.76rem", color: "#334155", ...(savedPass ? { borderBottom: "none" } : {}) }}>
                                  {user.displayName}
                                </TableCell>
                                <TableCell sx={{ ...mono, fontSize: "0.72rem", color: "#64748b", ...(savedPass ? { borderBottom: "none" } : {}) }}>
                                  {user.userPrincipalName || "-"}
                                </TableCell>
                                <TableCell align="right" sx={savedPass ? { borderBottom: "none" } : undefined}>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => {
                                      void handleCreateForUser(user.id);
                                    }}
                                    disabled={disabled || running}
                                    sx={{
                                      textTransform: "none",
                                      ...mono,
                                      fontSize: "0.72rem",
                                      py: 0.35,
                                      px: 1.2,
                                      background: isCurrentResult ? "#16a34a" : "#2563eb",
                                      "&:hover": { background: isCurrentResult ? "#15803d" : "#1d4ed8" },
                                      "&.Mui-disabled": { background: "#e2e8f0", color: "#94a3b8" },
                                    }}
                                  >
                                    {isCreatingThisUser ? "Creating..." : savedPass ? "Create Again" : "Create Access Pass"}
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {savedPass && (
                                <TableRow sx={isCurrentResult ? { background: "#f0fdf4" } : { background: "inherit" }}>
                                  <TableCell colSpan={3} sx={{ py: 0.5, px: 1.5 }}>
                                    <CopyRow label="ACCESS_PASS_PASSWORD_VALUE" value={savedPass} masked />
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}

                {!managerUsersLoading && managerUsers.length > PAGE_SIZE && (
                  <Box sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        sx={{ textTransform: "none", ...mono, minWidth: 0, px: 1 }}
                      >
                        Prev
                      </Button>
                      {visiblePages.map((page) => (
                        <Button
                          key={page}
                          size="small"
                          variant={page === currentPage ? "contained" : "outlined"}
                          onClick={() => setCurrentPage(page)}
                          sx={{ textTransform: "none", ...mono, minWidth: 32, px: 0.75 }}
                        >
                          {page}
                        </Button>
                      ))}
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        sx={{ textTransform: "none", ...mono, minWidth: 0, px: 1 }}
                      >
                        Next
                      </Button>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Typography sx={{ fontSize: "0.7rem", color: "#854d0e", ...mono }}>
                        Page {currentPage} of {totalPages}
                      </Typography>
                      <TextField
                        size="small"
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && goToPage()}
                        placeholder="Page"
                        inputProps={{ style: { fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.75rem", width: 48 } }}
                      />
                      <Button size="small" variant="outlined" onClick={goToPage} sx={{ textTransform: "none", ...mono }}>
                        Go
                      </Button>
                    </Box>
                  </Box>
                )}

                {!managerUsersLoading && managerUsers.length === 0 && !managerUsersError && (
                  <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono }}>
                    No users found that are managed by your signed-in account.
                  </Typography>
                )}

                {managerUsersError && (
                  <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{managerUsersError}</Typography>
                )}

                {manualTenantId !== "" && (
                  <Button
                    size="small"
                    onClick={changeTenant}
                    sx={{ minWidth: 0, fontSize: "0.68rem", color: "#94a3b8", textTransform: "none", ...mono, py: 0, "&:hover": { color: "#2563eb" } }}
                  >
                    Change tenant
                  </Button>
                )}
              </Box>
            </Box>
          )}

          {subsError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444", ...mono }}>{subsError}</Typography>}

          {/* Progress steps */}
          {showingSelectedUserSteps && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid #e2e8f0", pl: 1.5 }}>
              {hydratedSelectedUserSteps.map((s) => (
                <StepRow key={s.id} step={s} />
              ))}
              {running && <Typography sx={{ fontSize: "0.68rem", color: "#94a3b8", ...mono, mt: 0.5 }}>Running...</Typography>}
              {!running && (
                <Button
                  size="small"
                  onClick={reset}
                  sx={{
                    alignSelf: "flex-start",
                    mt: 0.5,
                    textTransform: "none",
                    ...mono,
                    fontSize: "0.72rem",
                    color: "#64748b",
                    "&:hover": { color: "#2563eb" },
                  }}
                >
                  ↩ Try again
                </Button>
              )}
            </Box>
          )}

          {/* Consent warning */}
          {consentFailed && (
            <Box sx={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: "8px", px: 2, py: 1.25 }}>
              <Typography sx={{ fontSize: "0.78rem", color: "#713f12", ...mono, fontWeight: 600 }}>
                ⚠ Admin consent failed — grant manually
              </Typography>
              <Typography sx={{ fontSize: "0.72rem", color: "#854d0e", ...mono, mt: 0.5 }}>
                Entra ID → App registrations → {appName} → API permissions → Grant admin consent for [tenant]
              </Typography>
            </Box>
          )}

          {/* Output is displayed inline under each user row */}
        </Box>
      )}
    </>
  );
}
