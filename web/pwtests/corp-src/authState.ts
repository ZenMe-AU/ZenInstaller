/// <reference types="node" />

import fs from "fs";
import path from "path";

export const authDir = path.join(process.cwd(), "web/pwtests/corp-src/auth/.auth");
export const storageStateFile = path.join(authDir, "github-oauth.storage.json");

export function corpGithubAuthStateExists() {
	return fs.existsSync(storageStateFile);
}
