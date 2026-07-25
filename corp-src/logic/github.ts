// GitHub URL builders shared across corp-src.

export function getRepoUrl(repoFullName: string): string {
  return `https://github.com/${repoFullName}`;
}

export function getEnvSettingsUrl(repoFullName: string, envId: number): string {
  return `https://github.com/${repoFullName}/settings/environments/${envId}/edit`;
}
