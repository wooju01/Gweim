// 결과 파일: scripts/sim/results/YYYY-MM-DD-이름.md
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "results");

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 결과를 모아 파일로 쓴다. 이름 예: "boss", "campaign" (같은 날 같은 이름이면 덮어쓴다) */
export class Report {
  private lines: string[] = [];
  constructor(private name: string) {}
  line(x = "") {
    this.lines.push(x);
  }
  table(head: string[], rows: (string | number)[][]) {
    this.line(`| ${head.join(" | ")} |`);
    this.line(`|${head.map(() => "---").join("|")}|`);
    for (const r of rows) this.line(`| ${r.join(" | ")} |`);
    this.line();
  }
  save(): string {
    mkdirSync(DIR, { recursive: true });
    const file = join(DIR, `${today()}-${this.name}.md`);
    writeFileSync(file, this.lines.join("\n") + "\n");
    return file;
  }
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
