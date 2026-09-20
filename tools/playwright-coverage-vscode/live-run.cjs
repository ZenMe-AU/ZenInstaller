const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createLiveRun(vscode, controller, profile, uri) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-coverage-'));
  const events = path.join(directory, 'events.jsonl');
  fs.writeFileSync(events, '');
  const parent = controller.createTestItem(directory, path.basename(uri.fsPath), uri);
  controller.items.add(parent);
  const run = controller.createTestRun(new vscode.TestRunRequest([parent], undefined, profile), 'Playwright coverage', true);
  run.started(parent);
  const tests = new Map();
  const pending = new Set();
  let offset = 0;
  let failed = false;
  let ended = false;
  function poll() {
    const content = fs.readFileSync(events, 'utf8');
    const end = content.lastIndexOf('\n') + 1;
    const lines = content.slice(offset, end).split('\n').filter(Boolean);
    offset = end;
    for (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === 'begin') {
        for (const test of event.tests) {
          const item = controller.createTestItem(test.id, test.title, vscode.Uri.file(test.location.file));
          const line = Math.max(0, test.location.line - 1);
          item.range = new vscode.Range(line, 0, line, 0);
          parent.children.add(item);
          tests.set(test.id, item);
          pending.add(test.id);
          run.enqueued(item);
        }
      } else if (event.type === 'start') {
        pending.add(event.id);
        run.started(tests.get(event.id));
      } else if (event.type === 'result') {
        const item = tests.get(event.id);
        pending.delete(event.id);
        if (event.status === 'skipped' || event.status === 'interrupted') run.skipped(item);
        else if (event.status === event.expectedStatus) run.passed(item, event.duration);
        else run.failed(item, new vscode.TestMessage(event.errors.join('\n') || `Unexpected status: ${event.status}`), event.duration);
      } else if (event.type === 'error') {
        failed = true;
        run.errored(parent, new vscode.TestMessage(event.text));
      } else if (event.type === 'output') {
        run.appendOutput(event.text.replace(/\r?\n/g, '\r\n'));
      }
    }
  }
  const timer = setInterval(() => {
    try { poll(); } catch (error) { run.appendOutput(`Progress reporting error: ${error.message}\r\n`); }
  }, 100);
  return {
    events, run,
    async finish(exitCode) {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      try {
        poll();
        for (const id of pending) run.skipped(tests.get(id));
        if (exitCode !== 0) run.errored(parent, new vscode.TestMessage(`Playwright exited with code ${exitCode ?? 'unknown'}. See test output or the task terminal.`));
        else if (!failed) run.passed(parent);
      } finally {
        run.end();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}
module.exports = { createLiveRun };
