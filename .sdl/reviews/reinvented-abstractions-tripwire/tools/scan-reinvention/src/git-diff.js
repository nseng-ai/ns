import { readFile } from "node:fs/promises";
import { commandSucceeded } from "@sdl/core/command";
import { NodeCommandExecApi } from "@sdl/exec";
export class RealScannerIo {
    cwd;
    execApi;
    constructor(options) {
        this.cwd = options.cwd;
        this.execApi = options.execApi ?? new NodeCommandExecApi();
    }
    async changedFiles(diffBase) {
        const result = await this.execApi.exec("git", ["diff", "--name-only", "--diff-filter=ACMR", `${diffBase}...HEAD`], { cwd: this.cwd });
        if (!commandSucceeded(result))
            return commandError("git diff --name-only failed", result);
        return ok(result.stdout.split(/\r?\n/u).filter((line) => line.trim() !== ""));
    }
    async addedLines(diffBase, file) {
        const result = await this.execApi.exec("git", ["diff", "--unified=0", `${diffBase}...HEAD`, "--", file], { cwd: this.cwd });
        if (!commandSucceeded(result))
            return commandError(`git diff for ${file} failed`, result);
        return ok(parseAddedLines(result.stdout));
    }
    async readFile(path) {
        try {
            return ok(await readFile(path, "utf8"));
        }
        catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
    }
}
export function parseAddedLines(diffText) {
    const addedLines = new Set();
    let newLine = 0;
    for (const line of diffText.split(/\r?\n/u)) {
        const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line);
        if (header !== null) {
            newLine = Number(header[1]);
            continue;
        }
        if (line.startsWith("+++"))
            continue;
        if (line.startsWith("+")) {
            addedLines.add(newLine);
            newLine += 1;
            continue;
        }
        if (!line.startsWith("-"))
            newLine += 1;
    }
    return addedLines;
}
function ok(value) {
    return { ok: true, value };
}
function commandError(message, result) {
    const details = result.stderr.trim() === "" ? result.stdout.trim() : result.stderr.trim();
    return {
        ok: false,
        message: details === "" ? `${message}: exit ${result.code}` : `${message}: ${details}`,
    };
}
