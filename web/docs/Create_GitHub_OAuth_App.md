# How to Create a GitHub OAuth App for ZenInstaller

ZenInstaller uses a GitHub OAuth App so users can sign in with their GitHub account. This is separate from the AWS/Azure OIDC setup — this app is what lets people log **into ZenInstaller itself**; sign-in is handled by Azure App Service Authentication (Easy Auth), which needs its own Client ID and Client Secret.

> Skip this if you only want to run ZenInstaller locally — set `GITHUB_TOKEN` in `backend/local.settings.json` to a personal access token instead, and the backend will authenticate as that user without needing an OAuth flow at all.

---

## Step 1 — Decide the Function App name first

The callback URL below depends on your Function App's hostname, which is derived from `TARGET_ENV` in `deploy/.env` (`function_app_name = "<TARGET_ENV>-app"`). Decide that value before creating the OAuth App so you can fill in the callback URL correctly.

For example, `TARGET_ENV=zen-installer` gives a Function App named `zen-installer-app`, reachable at `https://zen-installer-app.azurewebsites.net`.

---

## Step 2 — Create the OAuth App

1. Go to [https://github.com/settings/developers](https://github.com/settings/developers) (or your GitHub organization's **Settings → Developer settings**, if the app should belong to an org).
2. Click **OAuth Apps → New OAuth App**.
3. Fill in:

   | Field                      | Value                                                                      |
   | -------------------------- | -------------------------------------------------------------------------- |
   | Application name           | e.g. `ZenInstaller`                                                        |
   | Homepage URL               | Your deployed frontend URL, e.g. `https://www.zeninstaller.com`            |
   | Authorization callback URL | `https://<function-app-name>.azurewebsites.net/auth/login/github/callback` |

4. Click **Register application**.

> The `/auth` segment comes from `http_route_api_prefix` in `deploy/env/main.tf`'s `auth_settings_v2` block, currently set to `/auth`. Azure's default (if that setting is removed) is `/.auth` instead — if you ever change `http_route_api_prefix`, update the callback URL here to match.

> You don't need to configure scopes here — Azure Easy Auth requests `read:user`, `user:email`, `read:org`, and `repo` automatically when a user signs in.

---

## Step 3 — Generate a Client Secret

1. On the app's page, copy the **Client ID** shown at the top.
2. Click **Generate a new client secret**, then copy the value immediately — GitHub only shows it once.

---

## Step 4 — Put the values into `deploy/.env`

```
OAUTH_CLIENT_ID=<the Client ID from Step 3>
OAUTH_SECRET=<the Client Secret from Step 3>
```

`OAUTH_CLIENT_ID` is passed to Terraform as a plain variable; `OAUTH_SECRET` is pushed into Key Vault by the deploy script and never stored in Terraform state.

---

## Step 5 — Update the callback URL if the hostname or auth prefix ever changes

Go back to the OAuth App's settings on GitHub and update **Authorization callback URL** if either of these change later — otherwise sign-in will fail with a redirect URI mismatch:

- **Hostname** — changes if you rename `TARGET_ENV` or move the backend behind a custom domain.
- **Auth prefix** — changes if `http_route_api_prefix` in `deploy/env/main.tf` is edited (currently `/auth`).
