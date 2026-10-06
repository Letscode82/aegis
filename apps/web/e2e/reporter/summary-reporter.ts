/**
 * Custom Playwright reporter → a human-readable Markdown pass/fail summary.
 *
 * The built-in HTML report (e2e-report/html) is the rich, clickable view with
 * screenshots, traces and videos. This reporter adds a compact `summary.md`
 * that's easy to paste into a chat/PR: one row per test grouped by feature
 * area, counts, duration, failure messages, and the screenshot paths captured
 * for each feature.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

type Row = {
  area: string;
  title: string;
  status: TestResult["status"];
  expected: TestCase["expectedStatus"];
  durationMs: number;
  error?: string;
  screenshots: string[];
};

const STATUS_ICON: Record<string, string> = {
  passed: "✅",
  failed: "❌",
  timedOut: "⏱️",
  skipped: "⏭️",
  interrupted: "⚠️",
};

/** Map a test's file to a friendly feature-area name. */
function areaFor(test: TestCase): string {
  const file = path.basename(test.location.file).replace(/\.spec\.[tj]s$/, "");
  const map: Record<string, string> = {
    "00-smoke": "Smoke / Shell",
    intake: "Legal Intake",
    contracts: "Contracts",
    "one-legal": "ONE Legal",
  };
  return map[file] || file;
}

export default class SummaryReporter implements Reporter {
  private rows: Row[] = [];
  private startedAt = 0;
  private outFile: string;
  private baseUrl: string;

  constructor(opts: { outFile?: string } = {}) {
    this.outFile = opts.outFile || path.join(process.cwd(), "e2e-report", "summary.md");
    this.baseUrl = process.env.E2E_BASE_URL || "http://localhost:5173";
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startedAt = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const screenshots = result.attachments
      .filter((a) => a.contentType === "image/png" && a.path)
      .map((a) => a.path as string);
    this.rows.push({
      area: areaFor(test),
      title: test.title,
      status: result.status,
      expected: test.expectedStatus,
      durationMs: result.duration,
      error: result.error?.message?.split("\n").slice(0, 4).join(" "),
      screenshots,
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const byArea = new Map<string, Row[]>();
    for (const r of this.rows) {
      if (!byArea.has(r.area)) byArea.set(r.area, []);
      byArea.get(r.area)!.push(r);
    }

    const total = this.rows.length;
    const passed = this.rows.filter((r) => r.status === "passed").length;
    const failed = this.rows.filter((r) => r.status === "failed" || r.status === "timedOut").length;
    const skipped = this.rows.filter((r) => r.status === "skipped").length;
    const durationS = ((Date.now() - this.startedAt) / 1000).toFixed(1);
    const mutations = process.env.E2E_ALLOW_MUTATIONS === "1" && process.env.E2E_TARGET === "test";

    const L: string[] = [];
    L.push(`# AEGIS e2e test report`);
    L.push("");
    L.push(`- **Run:** ${new Date().toISOString()}`);
    L.push(`- **Target:** ${this.baseUrl}`);
    L.push(`- **Mode:** ${mutations ? "read + **write** (E2E_TARGET=test)" : "read-only (safe for the live demo)"}`);
    L.push(`- **Overall:** ${result.status === "passed" ? "✅ PASSED" : "❌ FAILED"} · ${durationS}s`);
    L.push(`- **Totals:** ${passed} passed · ${failed} failed · ${skipped} skipped · ${total} total`);
    L.push("");

    // Area roll-up table.
    L.push(`| Feature area | ✅ | ❌ | ⏭️ |`);
    L.push(`|---|---|---|---|`);
    for (const [area, rows] of byArea) {
      const p = rows.filter((r) => r.status === "passed").length;
      const f = rows.filter((r) => r.status === "failed" || r.status === "timedOut").length;
      const s = rows.filter((r) => r.status === "skipped").length;
      L.push(`| ${area} | ${p} | ${f} | ${s} |`);
    }
    L.push("");

    // Per-area detail.
    for (const [area, rows] of byArea) {
      L.push(`## ${area}`);
      L.push("");
      for (const r of rows) {
        const icon = STATUS_ICON[r.status] || r.status;
        L.push(`### ${icon} ${r.title}  _(${(r.durationMs / 1000).toFixed(1)}s)_`);
        if (r.error) {
          L.push("");
          L.push("```");
          L.push(r.error);
          L.push("```");
        }
        if (r.screenshots.length) {
          for (const s of r.screenshots) {
            const rel = path.relative(path.dirname(this.outFile), s);
            L.push(`- 📸 \`${rel}\``);
          }
        }
        L.push("");
      }
    }

    L.push("---");
    L.push(`Rich report with screenshots & traces: open \`e2e-report/html/index.html\` ` + `(\`pnpm --filter @aegis/web test:e2e:report\`).`);
    L.push("");

    fs.mkdirSync(path.dirname(this.outFile), { recursive: true });
    fs.writeFileSync(this.outFile, L.join("\n"), "utf8");
    // Echo the headline so a terminal/CI run shows it without opening the file.
    // eslint-disable-next-line no-console
    console.log(`\n[e2e summary] ${passed}/${total} passed, ${failed} failed, ${skipped} skipped → ${path.relative(process.cwd(), this.outFile)}\n`);
  }
}
