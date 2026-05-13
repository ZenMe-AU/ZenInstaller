import { runDeploy } from "./delivery/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appCwd = path.resolve(__dirname, "../app");

const config = JSON.parse(fs.readFileSync("./env/terraform.auto.tfvars.json", "utf8"));

await runDeploy({
  subscriptionId: config.subscription_id,
  vaultName: config.key_vault_name,
  secretList: {
    "jwt-secret": process.env.JWT_SECRET,
    "oauth-secret": process.env.OAUTH_SECRET,
    "github-app-private-key": process.env.GH_PRIVATE_KEY,
  },
  functionAppName: config.function_app_name,
  resourceGroupName: config.resource_group_name,
  appCwd,
});
