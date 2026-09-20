const assert = require('node:assert/strict');
const { test } = require('node:test');
const { summarize, details } = require('./coverage.cjs');

class Position {
  constructor(line, character) { Object.assign(this, { line, character }); }
  compareTo(other) { return this.line - other.line || this.character - other.character; }
}
class Range {
  constructor(...positions) {
    assert.ok(positions.every(value => Number.isInteger(value) && value >= 0), JSON.stringify(positions));
    this.positions = positions;
    this.start = new Position(...positions.slice(0, 2));
    this.end = new Position(...positions.slice(2));
  }
  contains(other) { return this.start.compareTo(other.start) <= 0 && this.end.compareTo(other.end) >= 0; }
}
class StatementCoverage {
  constructor(executed, location) { Object.assign(this, { executed, location, branches: [] }); }
}
class DeclarationCoverage {
  constructor(name, executed, location) { Object.assign(this, { name, executed, location }); }
}
class BranchCoverage {
  constructor(executed, location) { Object.assign(this, { executed, location }); }
}
const api = { Range, StatementCoverage, DeclarationCoverage, BranchCoverage };

test('keeps uncovered statements, branch arms and functions in summaries', () => {
  assert.deepEqual(summarize({ s: { 0: 4, 1: 0 }, b: { 0: [2, 0] }, f: { 0: 0 } }), {
    statements: { covered: 1, total: 2 }, branches: { covered: 1, total: 2 }, functions: { covered: 0, total: 1 },
  });
});

test('converts one-based Istanbul source positions to zero-based editor ranges', () => {
  const location = { start: { line: 2, column: 3 }, end: { line: 4, column: 5 } };
  const result = details(api, {
    s: { 0: 0 }, statementMap: { 0: location }, b: {}, branchMap: {},
    f: { 0: 2 }, fnMap: { 0: { name: 'example', decl: location } },
  });
  assert.deepEqual(result[0].location.positions, [1, 3, 3, 5]);
  assert.equal(result[0].executed, 0);
  assert.equal(result[1].name, 'example');
  assert.equal(result[1].executed, 2);
});

test('attaches executed and missed branch arms to their enclosing statement', () => {
  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 20 } };
  const result = details(api, {
    s: { 0: 2 }, statementMap: { 0: loc }, f: {}, fnMap: {},
    b: { 0: [2, 0] }, branchMap: { 0: { loc, locations: [loc, { start: {}, end: {} }] } },
  });
  assert.deepEqual(result[0].branches.map(branch => branch.executed), [2, 0]);
  assert.equal(result[0].branches[1].location, undefined);
});

test('handles Istanbul end-of-line columns serialized as null', () => {
  const result = details(api, {
    s: { 0: 1 }, statementMap: { 0: { start: { line: 1, column: 5 }, end: { line: 1, column: null } } },
    f: {}, fnMap: {}, b: {}, branchMap: {},
  });
  assert.deepEqual(result[0].location.positions, [0, 5, 0, 0x7fffffff]);
});

// Optional end-to-end validation against a locally generated browser report.
const fs = require('node:fs');
const path = require('node:path');
const report = path.join(__dirname, '../../web/coverage-playwright/coverage-final.json');
test('generated Playwright report is consumable by the editor adapter', { skip: !fs.existsSync(report) }, () => {
  const files = Object.values(JSON.parse(fs.readFileSync(report, 'utf8')));
  assert.ok(files.length > 0);
  for (const file of files) {
    const summary = summarize(file);
    const converted = details(api, file);
    assert.equal(converted.length, summary.statements.total + summary.functions.total);
  }
});
