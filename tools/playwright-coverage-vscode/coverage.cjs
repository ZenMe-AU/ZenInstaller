const count = values => ({ covered: values.filter(value => value > 0).length, total: values.length });

// Keep Istanbul's statement, branch and function metrics distinct.
function summarize(file) {
  return {
    statements: count(Object.values(file.s)),
    branches: count(Object.values(file.b).flat()),
    functions: count(Object.values(file.f)),
  };
}

function details(vscode, file) {
  const range = location => location?.start?.line && location?.end?.line ? new vscode.Range(
    location.start.line - 1, location.start.column ?? 0,
    // Istanbul's Infinity (end of line) becomes null when serialized to JSON.
    location.end.line - 1, location.end.column ?? 0x7fffffff,
  ) : undefined; // Implicit else branches have no source location.
  const statements = Object.entries(file.statementMap).map(([id, location]) =>
    new vscode.StatementCoverage(file.s[id], range(location)));
  for (const [id, branch] of Object.entries(file.branchMap)) {
    const location = range(branch.loc);
    const statement = location && statements.filter(item => item.location.contains(location))
      .sort((a, b) => b.location.start.compareTo(a.location.start))[0];
    if (statement) statement.branches.push(...branch.locations.map((arm, index) =>
      new vscode.BranchCoverage(file.b[id][index], range(arm))));
  }
  return [
    ...statements,
    ...Object.entries(file.fnMap).map(([id, fn]) =>
      new vscode.DeclarationCoverage(fn.name, file.f[id], range(fn.decl || fn.loc))),
  ];
}

module.exports = { summarize, details };
