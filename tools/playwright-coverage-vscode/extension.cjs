const vscode = require('vscode');
const path = require('node:path');
const { summarize, details } = require('./coverage.cjs');
const { createLiveRun } = require('./live-run.cjs');

async function activate(context) {
  const controller = vscode.tests.createTestController('zeninstaller-coverage', 'Playwright Coverage');
  const sourceData = new WeakMap();
  const badges = new Map();
  const activeRuns = new Map();
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

  async function load(root, existingRun) {
    const report = vscode.Uri.file(path.join(root, 'coverage-playwright', 'coverage-final.json'));
    try {
      const files = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(report)).toString('utf8'));
      // Validate before replacing a previous valid display.
      const entries = Object.values(files).map(file => ({ file, summary: summarize(file) }));
      const run = existingRun || controller.createTestRun(new vscode.TestRunRequest([], undefined, profile), 'Playwright coverage', false);
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
      } finally { if (!existingRun) run.end(); }
      changed.fire(undefined);
    } catch (error) {
      log.appendLine(`Cannot load ${report.fsPath}: ${error.message}`);
    }
  }

  // Works for runs launched by the official Playwright extension as well as CLI runs.
  for (const root of roots) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, 'coverage-playwright/coverage-final.json'));
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => {
      if (!activeRuns.has(root)) void load(root);
    }, 250); };
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
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    });
    let isDirectory = false;
    if (root) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        isDirectory = !!(stat.type & vscode.FileType.Directory);
      } catch {
        await vscode.window.showErrorMessage('The selected Playwright path is no longer available.');
        return;
      }
    }
    if (!root || (!isDirectory && !/\.spec\.[cm]?ts$/.test(uri.fsPath))) {
      await vscode.window.showErrorMessage('Select a Playwright spec file or directory under pwtests in this workspace.');
      return;
    }
    const relative = path.relative(root, uri.fsPath).replaceAll('\\', '/');
    if (activeRuns.has(root)) {
      await vscode.window.showErrorMessage('A coverage run is already active for this project. Stop it before starting another.');
      return;
    }
    const args = [path.join(root, 'node_modules/playwright/cli.js'), 'test', '--config',
      path.join(root, 'playwright.config.ts'), '--update-snapshots=none', '--headed'];
    // Mock specs need no interactive authentication setup. Integration specs retain dependencies.
    if (relative.split('/').includes('mock-tests')) args.push('--no-deps');
    // Match either platform's separator and keep directory matches within that directory.
    const separator = '[/\\\\]';
    const filter = relative.split('/').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(separator);
    args.push(filter + (isDirectory ? separator : '$'));
    const live = createLiveRun(vscode, controller, profile, uri);
    activeRuns.set(root, live);
    const task = new vscode.Task({ type: 'zeninstaller-coverage', file: uri.fsPath },
      vscode.workspace.getWorkspaceFolder(uri), 'Playwright coverage', 'Playwright Coverage',
      new vscode.ProcessExecution('node', args, { cwd: root, env: {
        DEBUG: [process.env.DEBUG, 'pw:api'].filter(Boolean).join(','),
        PLAYWRIGHT_COVERAGE: '1',
        PLAYWRIGHT_VSCODE_EVENTS: live.events,
        PLAYWRIGHT_VSCODE_REPORTER: path.join(__dirname, 'progress-reporter.cjs'),
      } }));
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated };
    const endListener = vscode.tasks.onDidEndTaskProcess(async event => {
      if (event.execution !== execution && event.execution.task !== task) return;
      endListener.dispose();
      cancellation.dispose();
      // Only import a report produced during this run.
      try {
        const report = await vscode.workspace.fs.stat(vscode.Uri.file(path.join(root, 'coverage-playwright', 'coverage-final.json')));
        if (report.mtime >= startedAt) await load(root, live.run);
      } catch (error) {
        live.run.appendOutput(`Coverage report unavailable: ${error.message}\r\n`);
      } finally {
        activeRuns.delete(root);
        await live.finish(event.exitCode);
      }
    });
    const startedAt = Date.now();
    let execution;
    const cancellation = live.run.token.onCancellationRequested(() => execution?.terminate());
    try {
      execution = await vscode.tasks.executeTask(task);
      if (live.run.token.isCancellationRequested) execution.terminate();
    } catch (error) {
      endListener.dispose();
      cancellation.dispose();
      activeRuns.delete(root);
      live.run.appendOutput(`${error.message}\r\n`);
      await live.finish(1);
    }
  }));
}

module.exports = { activate };
