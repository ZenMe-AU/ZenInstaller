/* Custom Playwright reporter- turns browser data into coverage report*/
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { convert } from "ast-v8-to-istanbul";
import libCoverage from "istanbul-lib-coverage";
import libReport from "istanbul-lib-report";
import reports from "istanbul-reports";
import { parseAstAsync } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "coverage-playwright");

function isApplicationFile(filename, projectRoot) {
  const relative = path.relative(projectRoot, filename).replaceAll("\\", "/");
  return !relative.startsWith("../") && !path.isAbsolute(relative)
    && !/(^|\/)(node_modules|pwtests|test|tests|__tests__)(\/|$)/.test(relative)
    && /\.[cm]?[jt]sx?$/.test(relative)
    && !/\.(test|spec|d)\.[cm]?[jt]sx?$/.test(relative)
    && existsSync(filename);
}

export async function convertEntries(entries, projectRoot = root) {
  const coverageMap = libCoverage.createCoverageMap({});
  for (const entry of entries) {
    const pathname = decodeURIComponent(new URL(entry.url).pathname);
    const filename = pathname.startsWith("/@fs/")
      ? pathname.slice(5) : path.resolve(projectRoot, `.${pathname}`);
    if (!isApplicationFile(filename, projectRoot)) continue;
    if (!entry.source) throw new Error(`Missing executed source for ${entry.url}`);
    // Use the map from the actual executed module, not a fresh Vite transform.
    const inline = /\/\/# sourceMappingURL=data:application\/json[^,]*;base64,([^\s]+)/.exec(entry.source);
    if (!inline) throw new Error(`Missing inline Vite source map for ${entry.url}`);
    const sourceMap = JSON.parse(Buffer.from(inline[1], "base64").toString("utf8"));
    sourceMap.sources = sourceMap.sources.map(source => {
      if (source.startsWith("file:")) return source;
      const resolved = path.isAbsolute(source) ? source : path.resolve(path.dirname(filename), sourceMap.sourceRoot || "", source);
      return pathToFileURL(resolved).href;
    });
    delete sourceMap.sourceRoot;
    coverageMap.merge(await convert({
      code: entry.source,
      ast: await parseAstAsync(entry.source),
      sourceMap,
      coverage: { ...entry, url: pathToFileURL(filename).href },
      wrapperLength: 0,
    }));
  }
  coverageMap.filter(filename => isApplicationFile(filename, projectRoot));
  return coverageMap;
}

export default class CoverageReporter {
  attachments = [];
  executedTests = 0;

  onTestEnd(_test, result) {
    if (result.status !== "skipped") this.executedTests++;
    // Include failed attempts too: they executed application code.
    this.attachments.push(...result.attachments.filter(item => item.name === "v8-coverage"));
  }

  async onEnd() {
    if (!this.executedTests) return;
    try {
      const coverageMap = libCoverage.createCoverageMap({});
      for (const attachment of this.attachments) {
        const data = attachment.body ?? await readFile(attachment.path);
        coverageMap.merge(await convertEntries(JSON.parse(data.toString("utf8"))));
      }
      if (!coverageMap.files().length) throw new Error("No application coverage collected. Run Chromium tests using the coverage fixture against the Vite dev server.");
      const context = libReport.createContext({ dir: output, coverageMap });
      for (const name of ["text", "html", "json", "lcovonly"]) {
        reports.create(name, { projectRoot: root }).execute(context);
      }
      console.log(`Playwright coverage: ${path.join(output, "index.html")}`);
    } catch (error) {
      console.error("Playwright coverage reporting failed:", error);
      return { status: "failed" };
    }
  }
}
