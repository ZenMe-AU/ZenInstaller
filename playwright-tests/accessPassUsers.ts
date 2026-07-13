/// <reference types="node" />

import fs from "fs";
import path from "path";
import { getUserAuthFiles, userAuthFilesExist } from "./authState";

export type AccessPassUser = {
  id: string;
  email: string;
  expectedPostLoginText: string;
  tenantId?: string;
  targetEntraUserEmail?: string;
  canCreateAccessPass?: boolean;
};

const localUsersPath = path.join(
  process.cwd(),
  "playwright-tests/data/access-pass-users.local.json",
);

const exampleUsersPath = path.join(
  process.cwd(),
  "playwright-tests/data/access-pass-users.example.json",
);

export function loadAccessPassUsers(): AccessPassUser[] {
  const filePath = fs.existsSync(localUsersPath)
    ? localUsersPath
    : exampleUsersPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing access pass users file. Create ${localUsersPath}`,
    );
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as AccessPassUser[];
}

export function getAccessPassUserAuth(user: AccessPassUser) {
  return {
    ...getUserAuthFiles(user.id),
    exists: userAuthFilesExist(user.id),
  };
}