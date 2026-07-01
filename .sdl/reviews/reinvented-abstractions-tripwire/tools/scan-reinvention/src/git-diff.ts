import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { commandSucceeded, type CommandExecApi } from "@sdl/core/command";
import { NodeCommandExecApi } from "@sdl/exec";

export interface ScannerIo {
  changedFiles(diffBase: string): Promise<IoResult<readonly string[]>>;
  addedLines(diffBase: string, file: string): Promise<IoResult<ReadonlySet<number>>>;
  readFile(path: string): Promise<IoResult<string>>;
}

export type IoResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

export interface RealScannerIoOptions {
  readonly cwd: string;
  readonly execApi?: CommandExecApi;
}

export class RealScannerIo implements ScannerIo {
  private readonly cwd: string;
  private readonly execApi: CommandExecApi;
  private repoRootCache: string | null = null;

  constructor(options: RealScannerIoOptions) {
    this.cwd = options.cwd;
    this.execApi = options.execApi ?? new NodeCommandExecApi();
  }

  async changedFiles(diffBase: string): Promise<IoResult<readonly string[]>> {
    const result = await this.execApi.exec(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", `${diffBase}...HEAD`],
      { cwd: this.cwd },
    );
    if (!commandSucceeded(result)) return commandError("git diff --name-only failed", result);
    return ok(result.stdout.split(/\r?\n/u).filter((line) => line.trim() !== ""));
  }

  async addedLines(diffBase: string, file: string): Promise<IoResult<ReadonlySet<number>>> {
    const result = await this.execApi.exec(
      "git",
      ["diff", "--unified=0", `${diffBase}...HEAD`, "--", file],
      { cwd: this.cwd },
    );
    if (!commandSucceeded(result)) return commandError(`git diff for ${file} failed`, result);
    return ok(parseAddedLines(result.stdout));
  }

  async readFile(path: string): Promise<IoResult<string>> {
    const root = await this.repoRoot();
    if (!root.ok) return root;
    try {
      return ok(await readFile(isAbsolute(path) ? path : join(root.value, path), "utf8"));
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  private async repoRoot(): Promise<IoResult<string>> {
    if (this.repoRootCache !== null) return ok(this.repoRootCache);
    const result = await this.execApi.exec("git", ["rev-parse", "--show-toplevel"], {
      cwd: this.cwd,
    });
    if (!commandSucceeded(result))
      return commandError("git rev-parse --show-toplevel failed", result);
    this.repoRootCache = result.stdout.trim();
    return ok(this.repoRootCache);
  }
}

export function parseAddedLines(diffText: string): ReadonlySet<number> {
  const addedLines = new Set<number>();
  let newLine = 0;
  for (const line of diffText.split(/\r?\n/u)) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
    if (header !== null) {
      newLine = Number(header[1]);
      continue;
    }
    if (line.startsWith("+++")) continue;
    if (line.startsWith("+")) {
      addedLines.add(newLine);
      newLine += 1;
      continue;
    }
    if (!line.startsWith("-")) newLine += 1;
  }
  return addedLines;
}

function ok<T>(value: T): IoResult<T> {
  return { ok: true, value };
}

function commandError(
  message: string,
  result: {
    readonly stderr: string;
    readonly stdout: string;
    readonly code: number;
    readonly killed: boolean;
  },
): IoResult<never> {
  const details = result.stderr.trim() === "" ? result.stdout.trim() : result.stderr.trim();
  return {
    ok: false,
    message: details === "" ? `${message}: exit ${result.code}` : `${message}: ${details}`,
  };
}
