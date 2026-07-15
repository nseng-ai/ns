import { describe, expect, test } from "vitest";

import { parseArgs } from "../src/cli-args.ts";
import type { ScannerIo } from "../src/git-diff.ts";
import { scanReinvention } from "../src/scan-reinvention.ts";

const candidateFile = "ts/packages/example/src/app.ts";

const candidateIo: ScannerIo = {
  async changedFiles() {
    return { ok: true, value: [candidateFile] };
  },
  async addedLines() {
    return { ok: true, value: new Set([1]) };
  },
  async readFile() {
    return {
      ok: true,
      value: 'import { spawn } from "node:child_process";\n',
    };
  },
};

describe("parseArgs", () => {
  test("defaults the head ref to HEAD", () => {
    const parsed = parseArgs(["--diff-base", "main"]);

    expect(parsed).toMatchObject({ ok: true, value: { diffBase: "main", head: "HEAD" } });
  });

  test("accepts an explicit head ref", () => {
    const parsed = parseArgs(["--diff-base", "main", "--head", "feature-tip"]);

    expect(parsed).toMatchObject({ ok: true, value: { head: "feature-tip" } });
  });

  test("rejects a head flag without a value", () => {
    expect(parseArgs(["--diff-base", "main", "--head"])).toEqual({
      ok: false,
      code: "missing-head",
      message: "--head requires a value.",
    });
  });

  test("requires a diff base", () => {
    expect(parseArgs([])).toEqual({
      ok: false,
      code: "missing-diff-base",
      message: "--diff-base is required.",
    });
  });

  test("its output drives every detector through the scanner composition seam", async () => {
    const parsed = parseArgs(["--diff-base", "main"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const output = await scanReinvention({
      cwd: "/repo",
      ...parsed.value,
      io: candidateIo,
    });

    expect(output.success).toBe(true);
    if (!output.success) return;
    expect(output.candidates).toMatchObject([
      { kind: "subprocess", file: candidateFile, line: 1, isAddedLine: true },
    ]);
  });
});
