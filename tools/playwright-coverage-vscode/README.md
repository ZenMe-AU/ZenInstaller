# Playwright coverage in VS Code

This local extension reads `web/coverage-playwright/coverage-final.json` (also
works when opening `web` as the workspace). It has no runtime dependencies.
It adds native Test Coverage summaries and source highlights, plus Explorer
badges: ✓ fully covered, ◐ partially covered, ○ uncovered. Hover for statement
counts. These describe the latest coverage run, not all tests ever executed.

## Install

From the repository root on Windows:

```powershell
./tools/playwright-coverage-vscode/build.ps1
code --install-extension ./tools/playwright-coverage-vscode/dist/zeninstaller-playwright-coverage-0.1.1.vsix --force
```

Reload VS Code after installation. No marketplace publication is needed.

## Run

In the Playwright sidebar, enable `web/playwright.config.ts` using
**Select configs**, then enable **Test Corp**. The existing Run action runs
normal tests without coverage. For mock-only runs disable the authentication
setup projects.

From the repository root, run `pnpm --filter web test:pw` for normal tests or
`pnpm --filter web test:pw:coverage` for coverage. Both use the same config;
the coverage script is detected through `npm_lifecycle_event`. Direct CLI
runs can enable coverage by setting `PLAYWRIGHT_COVERAGE=1`.

Alternatively, use the coverage icon beside a Playwright test item or in the
spec editor title, or run **Playwright: Run File with Coverage**. This action
runs the entire containing spec through a visible VS Code task. Mock files
skip authentication dependencies; integration files retain them. It uses the
shared config with `PLAYWRIGHT_COVERAGE=1`, and does not update snapshots.
When reporting completes, coverage is automatically imported. Cancel with **Tasks: Terminate
Task**. Individual test selection, debug and watch remain with the official
Playwright extension.

Open **Test Coverage** in the Testing sidebar and select a source file to see
coverage. Use VS Code's **Test: Toggle Inline Coverage** to toggle highlights.
**Playwright: Load Latest Coverage** reloads an existing report manually.

The official Playwright extension owns its Run/Debug profiles; this extension
cannot add a native Coverage profile to that controller. The contributed
coverage icon is a separate file-level command. Reports imported by this
extension appear as a separate `Playwright coverage` result. Vitest results
remain independent. The native coverage display uses statement, branch and
function counts, just like the generated Istanbul report.

Tests: `node --test tools/playwright-coverage-vscode/coverage.test.cjs`.
