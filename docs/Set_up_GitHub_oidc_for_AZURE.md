# How to Set Up GitHub OIDC for Azure

GitHub OIDC lets GitHub Actions authenticate to Azure **without storing any secrets** — Azure issues a short-lived token at run time by trusting GitHub's identity provider.

## Prerequisites

- An Azure account and subscription — see [Creating AZURE account](/Creating_AZURE_account) if you haven't set one up yet
- Owner or User Access Administrator on the subscription (or a user who can create App Registrations and assign roles)

## Step 1 of 5 — Register an App in Microsoft Entra ID

1. Go to [portal.azure.com](https://portal.azure.com) and sign in.
2. Search for **Microsoft Entra ID** in the top search bar and open it.
3. In the left sidebar, click **App registrations**.
4. Click **+ New registration**.
5. Fill in:
   | Field | Value |
   | ------------ | --------------------------------------------- |
   |**Name** |give it a meaningful name (e.g. `github-actions-deployer`) |
   |**Supported account types** |select **Accounts in this organizational directory only** |
   |**Redirect URI** |leave blank |
6. Click **Register**.
7. On the app's overview page, copy and save:
   - **Application (client) ID**
   - **Directory (tenant) ID**

## Step 2 of 5 — Add a Federated Identity Credential

1. On the app registration page, click **Certificates & secrets** in the left sidebar.
2. Select the **Federated credentials** tab.
3. Click **+ Add credential**.
4. Under **Federated credential scenario**, select **GitHub Actions deploying Azure resources**.
5. Fill in the GitHub details:

   | Field                   | What to Enter                                                                                            |
   | ----------------------- | -------------------------------------------------------------------------------------------------------- |
   | Organization            | Your GitHub organisation or username (e.g. `my-org`)                                                     |
   | Repository              | The repository name (e.g. `ZBCorpArchitecture`)                                                          |
   | Entity type             | Select **Environment**                                                                                   |
   | GitHub environment name | The GitHub Environment name (e.g. `PROD`) — must exactly match the `environment:` value in your workflow |
   | Name                    | A name for this credential (e.g. `github-actions-prod`)                                                  |

6. Click **Add**.

> **Tip:** Add one federated credential per GitHub Environment (e.g. `PROD`, `TEST`). Each environment can have its own protection rules (required reviewers, wait timers) in GitHub Settings.

## Step 3 of 5 — Assign Azure RBAC Roles

The app registration acts as a Service Principal. Assign roles at the subscription scope so it can deploy resources across all resource groups.

1. Go to **Subscriptions** and open your subscription.

   > On the overview page, copy and save:
   >
   > - Subscription ID

2. Click **Access control (IAM)** in the left sidebar.
3. Click **+ Add** → **Add role assignment**.
4. Assign the following roles one at a time:

   | Role                          | Why it is needed                                                     |
   | ----------------------------- | -------------------------------------------------------------------- |
   | **Contributor**               | Create and manage all Azure resources                                |
   | **User Access Administrator** | Assign RBAC roles to managed identities and groups during deployment |

5. For each role:
   - **Role** tab: search for the role name and select it
   - **Members** tab: set **Assign access to** = `User, group, or service principal` → click **+ Select members** → search for the app name registered in Step 1
   - Click **Review + assign**

> **Note:** If you enable **Constrain roles** on the User Access Administrator assignment, add **Owner**, **User Access Administrator**, and **Role Based Access Control Administrator** to the exclusion list. This prevents the Service Principal from escalating its own privileges.

## Step 4 of 5 — Add a Graph API Permission

If your workflow creates Entra ID groups, users, or app registrations, the Service Principal also needs Microsoft Graph API permissions.

1. Return to **Microsoft Entra ID** → **App registrations** → your app.
2. Click **API permissions** in the left sidebar.
3. Click **+ Add a permission** → **Microsoft Graph** → **Application permissions**.
4. Add the permissions your workflow requires. Common ones for this project:

   | Permission                                | Used for                               |
   | ----------------------------------------- | -------------------------------------- |
   | `Group.ReadWrite.All`                     | Create / manage Entra security groups  |
   | `GroupMember.ReadWrite.All`               | Add members to groups                  |
   | `User.ReadWrite.All`                      | Create and manage user accounts        |
   | `Application.ReadWrite.All`               | Register and update app registrations  |
   | `AppRoleAssignment.ReadWrite.All`         | Assign app roles to users and services |
   | `RoleManagement.ReadWrite.Directory`      | Assign PIM-eligible directory roles    |
   | `Policy.ReadWrite.AuthenticationMethod`   | Manage FIDO2 / TAP policies            |
   | `PrivilegedAccess.ReadWrite.AzureADGroup` | PIM for groups                         |
   | `UserAuthenticationMethod.ReadWrite.All`  | Create Temporary Access Passes         |

5. After adding all permissions, click **Grant admin consent for [your tenant]** and confirm.

> **Tip:** To replicate this permission set on a new app without using CLI, copy the `requiredResourceAccess` block from this app's **Manifest** (sidebar → **Manifest**) and paste it into the new app's manifest, then grant admin consent.

## Step 5 of 5 — Enter the Values in ZenInstaller

Return to the ZenInstaller page and open the **Environment** step. In the **Azure** section, enter:

| Field                   | Where to find it                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | Application (client) ID from Step 1                                                          |
| `AZURE_TENANT_ID`       | Directory (tenant) ID from Step 1                                                            |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID from Step 2 (also visible in the Azure Portal under **Subscriptions**) |

ZenInstaller will save these as GitHub Actions variables in your repository automatically.
