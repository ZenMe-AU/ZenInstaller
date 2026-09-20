const { appendFileSync } = require('node:fs');

class ProgressReporter {
  emit(event) {
    appendFileSync(process.env.PLAYWRIGHT_VSCODE_EVENTS, JSON.stringify(event) + '\n');
  }
  onBegin(_config, suite) {
    this.emit({ type: 'begin', tests: suite.allTests().map(test => ({
      id: test.id, title: test.titlePath().filter(Boolean).join(' › '), location: test.location,
    })) });
  }
  onTestBegin(test) { this.emit({ type: 'start', id: test.id }); }
  onTestEnd(test, result) {
    this.emit({ type: 'result', id: test.id, status: result.status,
      expectedStatus: test.expectedStatus, duration: result.duration,
      errors: result.errors.map(error => error.stack || error.message || String(error)) });
  }
  onStdOut(chunk) { this.emit({ type: 'output', text: chunk.toString() }); }
  onStdErr(chunk) { this.emit({ type: 'output', text: chunk.toString() }); }
  onError(error) { this.emit({ type: 'error', text: error.stack || error.message || String(error) }); }
}
module.exports = ProgressReporter;
