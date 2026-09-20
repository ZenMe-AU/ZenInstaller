const vscode = require('vscode');
const path = require('node:path');
const { summarize, details } = require('./coverage.cjs');

async function activate(context) {
  const controller = vscode.tests.createTestController('zeninstaller-coverage', 'Playwright Coverage');
  const sourceData = new WeakMap();
  const badges = new Map();
  const changed = new vscode.EventEmitter();
  const log = vscode.window.createOutputChannel('Playwright Coverage');
  context.subscriptions.push(controller, changed, log);
  context.subscriptions.push(vscode.window.registerFileDecorationProvider({
    onDidChangeFileDecorations: changed.event,
    provideFileDecoration: uri => badges.get(uri.toString()),
  }));
  const configs = await vscode.workspace.findFiles('**/playwright.config.ts', '**/node_modules/**');
  const roots = configs.map(uri => path.dirname(uri.fsPath));
  const profile = controller.createRunProfile('Load latest Playwright report', vscode.TestRunProfileKind.Coverage,
    async () => { for (const root of roots) await load(root); }, true);
  profile.loadDetailedCoverage = (_run, coverage) => details(vscode, sourceData.get(coverage));

  async function load(root) {
    const report = vscode.Uri.file(path.join(root, 'coverage-playwright', 'coverage-final.json'));
    try {
      const files = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(report)).toString('utf8'));
      // Validate before replacing a previous valid display.
      const entries = Object.values(files).map(file => ({ file, summary: summarize(file) }));
      const run = controller.createTestRun(new vscode.TestRunRequest([], undefined, profile), 'Playwright coverage', false);
      try {
        for (const [key] of badges) {
          const relative = path.relative(root, vscode.Uri.parse(key).fsPath);
          if (!relative.startsWith('..') && !path.isAbsolute(relative)) badges.delete(key);
        }
        for (const { file, summary } of entries) {
          const uri = vscode.Uri.file(file.path);
          const coverage = new vscode.FileCoverage(uri, summary.statements, summary.branches, summary.functions);
          sourceData.set(coverage, file);
          run.addCoverage(coverage);
          const { covered, total } = summary.statements;
          const percent = total ? Math.round(100 * covered / total) : 100;
          badges.set(uri.toString(), {
            badge: covered === total ? '✓' : covered === 0 ? '○' : '◐',
            tooltip: `Playwright: ${covered}/${total} statements covered (${percent}%) in the latest coverage run`,
          });
        }
      } finally { run.end(); }
      changed.fire(undefined);
    } catch (error) {
      log.appendLine(`Cannot load ${report.fsPath}: ${error.message}`);
    }
  }

  // Works for runs launched by the official Playwright extension as well as CLI runs.
  for (const root of roots) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, 'coverage-playwright/coverage-final.json'));
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void load(root), 250); };
    context.subscriptions.push(watcher, watcher.onDidCreate(refresh), watcher.onDidChange(refresh),
      { dispose: () => clearTimeout(timer) });
    await load(root);
  }
  context.subscriptions.push(vscode.commands.registerCommand('zeninstaller.coverage.load',
    async () => { for (const root of roots) await load(root); }));
  context.subscriptions.push(vscode.commands.registerCommand('zeninstaller.coverage.runFile', async item => {
    const uri = item?.uri || (item instanceof vscode.Uri ? item : vscode.window.activeTextEditor?.document.uri);
    const root = uri && roots.find(candidate => {
      const relative = path.relative(path.join(candidate, 'pwtests'), uri.fsPath);
      return !relative.startsWith('..') && !path.isAbsolute(relative) && /\.spec\.[cm]?ts$/.test(relative);
    });
    if (!root) {
      await vscode.window.showErrorMessage('Select a Playwright spec file in this workspace.');
      return;
    }
    const relative = path.relative(root, uri.fsPath).replaceAll('\\', '/');
    const args = [path.join(root, 'node_modules/playwright/cli.js'), 'test', '--config',
      path.join(root, 'playwright.config.ts'), '--update-snapshots=none'];
    // Mock specs need no interactive authentication setup. Integration specs retain dependencies.
    if (relative.includes('/mock-tests/')) args.push('--no-deps');
    args.push(relative.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
    const task = new vscode.Task({ type: 'zeninstaller-coverage', file: uri.fsPath },
      vscode.workspace.getWorkspaceFolder(uri), 'Playwright file coverage', 'Playwright Coverage',
      new vscode.ProcessExecution('node', args, { cwd: root, env: { DEBUG: '', PLAYWRIGHT_COVERAGE: '1' } }));
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated };
    await vscode.tasks.executeTask(task);
  }));
}

module.exports = { activate };
