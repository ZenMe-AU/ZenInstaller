/// <reference types="node" />

import fs from "fs";
import path from "path";
import { getUserAuthFiles, userAuthFilesExist } from "./authState";

export type ExpectedEntraResult = "users" | "empty" | "forbidden";

export type EntraTargetUser = {
  id: string;
  displayName?: string;
  email: string;
  allowRealAccessPassCreation?: boolean;
};

export type AccessPassUser = {
  id: string;
  email: string;
  expectedPostLoginText: string;
  tenantId?: string;
  /*
   * Expected result after loading the tenant:
   * users - one or more Entra users should appear.
   * empty - the tenant loads successfully but there are no target users.
   * forbidden - the authenticated account cannot read/manage Entra users.
   */
  expectedEntraResult?: "users" | "empty" | "forbidden";
  expectedEntraMessage?: string;
  //Users that appear in the "Select Entra user" table
  targetEntraUsers: EntraTargetUser[];
  canCreateAccessPass: boolean;
};

const localUsersPath = path.join(
  process.cwd(),
  "playwright-tests/data/access-pass-users.local.json",
);

const exampleUsersPath = path.join(
  process.cwd(),
  "playwright-tests/data/access-pass-users.example.json",
);

function validateAccessPassUsers(
  users: AccessPassUser[],
  filePath: string,
) {
  if (!Array.isArray(users)) {
    throw new Error(
      `Access Pass user data must be an array: ${filePath}`,
    );
  }

  for (const user of users) {
    if (!user.id?.trim()) {
      throw new Error(
        `Every Access Pass user must have an id in ${filePath}.`,
      );
    }

    if (!user.email?.trim()) {
      throw new Error(
        `Access Pass user "${user.id}" must have an email.`,
      );
    }

    if (!["users", "empty", "forbidden"].includes(user.expectedEntraResult ?? "")) {
      throw new Error(
        `Invalid expectedEntraResult for "${user.id}".`,
      );
    }

    // Normalize targetEntraUsers: treat null/undefined as empty array; reject other non-array values
    if (user.targetEntraUsers == null) {
      user.targetEntraUsers = [];
    } else if (!Array.isArray(user.targetEntraUsers)) {
      throw new Error(
        `targetEntraUsers must be an array for "${user.id}" in ${filePath}`,
      );
    }

    if (
      user.expectedEntraResult === "users" &&
      user.targetEntraUsers.length === 0
    ) {
      throw new Error(
        `"${user.id}" expects Entra users but has no configured targets.`,
      );
    }

    if (
      user.expectedEntraResult !== "users" &&
      user.targetEntraUsers.length > 0
    ) {
      throw new Error(
        `"${user.id}" expects "${user.expectedEntraResult}" but has target Entra users configured.`,
      );
    }

    if (
      user.expectedEntraResult !== "users" &&
      !user.expectedEntraMessage?.trim()
    ) {
      throw new Error(
        `"${user.id}" must provide expectedEntraMessage for an "${user.expectedEntraResult}" result.`,
      );
    }

    for (const target of user.targetEntraUsers) {
      if (!target.id?.trim() || !target.email?.trim()) {
        throw new Error(
          `Every target Entra user for "${user.id}" must have an id and email.`,
        );
      }
    }
  }
}

export function loadAccessPassUsers(): AccessPassUser[] {
  const filePath = fs.existsSync(localUsersPath)
    ? localUsersPath
    : exampleUsersPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing access pass users file. Create ${localUsersPath}`,
    );
  }

  const users = JSON.parse(fs.readFileSync(filePath, "utf-8")) as AccessPassUser[];
  validateAccessPassUsers(users, filePath);
  return users;
}

export function getAccessPassUserAuth(user: AccessPassUser) {
  return {
    ...getUserAuthFiles(user.id),
    exists: userAuthFilesExist(user.id),
  };
}