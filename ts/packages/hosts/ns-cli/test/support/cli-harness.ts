import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";

import { runNsCli } from "../../src/cli.ts";

const tempDirs: string[] = [];

export interface NsCliJsonRun {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
}

export async function createEmptyProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-cli-host-"));
	tempDirs.push(directory);
	return directory;
}

export async function runNsCliJson(args: readonly string[], cwd: string): Promise<NsCliJsonRun> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const homeDir = join(cwd, ".home");
	const exit = await runNsCli([...args, "--format", "json"], {
		cwd,
		homeDir,
		env: { HOME: homeDir, CLAUDE_CONFIG_DIR: join(cwd, ".claude-user") },
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
}

export function parseJsonOutput(run: { readonly stdout: string }): Record<string, unknown> {
	const parsed: unknown = JSON.parse(run.stdout);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("Expected JSON object output.");
	}
	return parsed as Record<string, unknown>;
}

export function dataFromEnvelope(envelope: Record<string, unknown>): Record<string, unknown> {
	const data = envelope.data;
	if (typeof data !== "object" || data === null) {
		throw new Error("Expected envelope data object.");
	}
	return data as Record<string, unknown>;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true })));
});
