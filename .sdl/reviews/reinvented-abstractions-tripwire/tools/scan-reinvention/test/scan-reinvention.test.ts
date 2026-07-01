import { describe, expect, test } from "vitest";

import { parseAddedLines, type IoResult, type ScannerIo } from "../src/git-diff.ts";
import { scanReinvention } from "../src/scan-reinvention.ts";

class FakeScannerIo implements ScannerIo {
  readonly changedFilesCalls: string[] = [];
  readonly addedLinesCalls: { readonly diffBase: string; readonly file: string }[] = [];
  private readonly files: Map<string, string>;
  private readonly changed: readonly string[];
  private readonly added: ReadonlyMap<string, ReadonlySet<number>>;

  constructor(options: {
    readonly files: Readonly<Record<string, string>>;
    readonly changed?: readonly string[];
    readonly added?: Readonly<Record<string, readonly number[]>>;
  }) {
    this.files = new Map(Object.entries(options.files));
    this.changed = options.changed ?? Object.keys(options.files);
    this.added = new Map(
      Object.entries(options.added ?? {}).map(([file, lines]) => [file, new Set(lines)]),
    );
  }

  async changedFiles(diffBase: string): Promise<IoResult<readonly string[]>> {
    this.changedFilesCalls.push(diffBase);
    return { ok: true, value: this.changed };
  }

  async addedLines(diffBase: string, file: string): Promise<IoResult<ReadonlySet<number>>> {
    this.addedLinesCalls.push({ diffBase, file });
    return { ok: true, value: this.added.get(file) ?? new Set<number>() };
  }

  async readFile(path: string): Promise<IoResult<string>> {
    const content = this.files.get(path);
    return content === undefined ? { ok: false, message: "missing" } : { ok: true, value: content };
  }
}

describe("scanReinvention", () => {
  test("requires a diff base", async () => {
    const output = await scanReinvention({
      cwd: "/repo",
      diffBase: "",
      addedOnly: true,
      includeExempt: false,
      io: new FakeScannerIo({ files: {} }),
    });

    expect(output).toEqual({
      success: false,
      error: { code: "missing-diff-base", message: "--diff-base is required." },
    });
  });

  test("derives changed production TypeScript files and filters to added-line candidates", async () => {
    const io = new FakeScannerIo({
      files: {
        "ts/packages/example/src/app.ts":
          'import { spawn } from "node:child_process";\nconst x = 1;\n',
        "ts/packages/example/test/app.test.ts": 'import { spawn } from "node:child_process";\n',
      },
      changed: ["ts/packages/example/test/app.test.ts", "ts/packages/example/src/app.ts"],
      added: { "ts/packages/example/src/app.ts": [1] },
    });

    const output = await scanReinvention({
      cwd: "/repo",
      diffBase: "main",
      addedOnly: true,
      includeExempt: false,
      io,
    });

    expect(output.success).toBe(true);
    if (!output.success) return;
    expect(output.scannedFiles).toBe(1);
    expect(output.candidates).toMatchObject([
      {
        kind: "subprocess",
        file: "ts/packages/example/src/app.ts",
        line: 1,
        addedLine: true,
      },
    ]);
    expect(io.changedFilesCalls).toEqual(["main"]);
  });

  test("supports kind and file narrowing", async () => {
    const io = new FakeScannerIo({
      files: {
        "ts/packages/example/src/config.ts": "const home = process.env.HOME;\nconst answer = 1;\n",
      },
      added: { "ts/packages/example/src/config.ts": [1] },
    });

    const output = await scanReinvention({
      cwd: "/repo",
      diffBase: "main",
      files: ["ts/packages/example/src/config.ts"],
      addedOnly: true,
      kinds: ["xdg-path"],
      includeExempt: false,
      io,
    });

    expect(output.success).toBe(true);
    if (!output.success) return;
    expect(output.candidates.map((candidate) => candidate.kind)).toEqual(["xdg-path"]);
    expect(io.changedFilesCalls).toEqual([]);
  });

  test("parses zero-context diff added line numbers", () => {
    expect([...parseAddedLines("@@ -1,0 +2,2 @@\n+one\n+two\n unchanged\n")]).toEqual([2, 3]);
  });
});
