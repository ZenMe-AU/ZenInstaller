import { Box, Button, CircularProgress, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import type { AccountInfo } from "@azure/msal-browser";
import { CLOUD_DOCS } from "../config/docsConfig";
import { MONO as mono } from "../config/styles";

type Props = {
  azureAccount: AccountInfo | null;
  loggingIn: boolean;
  loginError: string | null;
  login: () => void;
  logout: () => void;
};

// The Azure sign-in step on its own — independent of GitHub, and not gated by
// which environment is selected. App-registration, domain and terraform cards
// all reuse the session it establishes.
export default function AzureLoginDetail({ azureAccount, loggingIn, loginError, login, logout }: Props) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography sx={{ fontSize: "0.78rem", color: "#475569", lineHeight: 1.7 }}>
        Sign in with Azure so we can create the app registration and cloud resources for you. We never store your Azure credentials — sign-in happens
        directly with Microsoft, and only a short-lived access token is used.
      </Typography>

      {!azureAccount ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {loggingIn ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CircularProgress size={14} sx={{ color: "#2563eb" }} />
              <Typography sx={{ fontSize: "0.72rem", color: "#64748b" }}>Checking session...</Typography>
            </Box>
          ) : (
            <>
              <Button
                variant="contained"
                onClick={login}
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
                }}
              >
                Sign in with Azure
              </Button>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography sx={{ fontSize: "0.7rem", color: "#94a3b8" }}>No Azure account?</Typography>
                <Box
                  component="a"
                  href={CLOUD_DOCS.azure.createAccount}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: "flex", alignItems: "center", gap: 0.25, color: "#64748b", textDecoration: "none", "&:hover": { color: "#2563eb" } }}
                >
                  <Typography sx={{ fontSize: "0.7rem" }}>Create a free one</Typography>
                  <OpenInNewIcon sx={{ fontSize: 11 }} />
                </Box>
              </Box>
            </>
          )}
          {loginError && <Typography sx={{ fontSize: "0.72rem", color: "#ef4444" }}>{loginError}</Typography>}
        </Box>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: "0.78rem", color: "#64748b" }}>
            Signed in as{" "}
            <Box component="span" data-id="txtAzureUsername" sx={{ fontWeight: 600, ...mono }}>
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
      )}
    </Box>
  );
}
