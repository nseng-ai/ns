import { cpSync, mkdirSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import {
	parseJsonOutput,
	runCliWithFakes,
	type ScriptedExecResponse,
} from "../scenario/sdl-cli-fakes.ts";

const ARETRO_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/aretro", import.meta.url),
);

const tempDirs: string[] = [];

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in Aretro SDL extension loading", () => {
	test("exposes hidden Aretro exec command help through the SDL command face", async () => {
		const cwd = await createAretroProject();

		const rootHelp = runWithRealAretroExtension({ args: ["aretro", "--help"], cwd });
		expect(await rootHelp.exit).toBe(0);
		const rootOutput = rootHelp.stdout.join("");
		expect(rootOutput).toContain("Usage: sdl aretro");
		expect(rootOutput).not.toContain("collect-evidence");
		expect(rootOutput).not.toContain("read-evidence-detail");

		const collectHelp = runWithRealAretroExtension({
			args: ["aretro", "exec", "collect-evidence", "--help"],
			cwd,
		});
		expect(await collectHelp.exit).toBe(0);
		const collectOutput = collectHelp.stdout.join("");
		expect(collectOutput).toContain("Usage: sdl aretro exec collect-evidence");
		expect(collectOutput).toContain("--repo");
		expect(collectOutput).toContain("--branch");
		expect(collectOutput).toContain("--session-root");

		const detailHelp = runWithRealAretroExtension({
			args: ["aretro", "exec", "read-evidence-detail", "--help"],
			cwd,
		});
		expect(await detailHelp.exit).toBe(0);
		expect(detailHelp.stdout.join("")).toContain("Usage: sdl aretro exec read-evidence-detail");
	});

	test("publishes schema and runs collect-evidence through the SDL command face", async () => {
		const cwd = await createAretroProject();
		const sessionRoot = join(cwd, "sessions");
		await mkdir(sessionRoot, { recursive: true });

		const schema = runWithRealAretroExtension({
			args: ["aretro", "exec", "collect-evidence", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(schema.stdout.join("")).toContain("aggregate_metrics");

		const collect = runWithRealAretroExtension({
			args: [
				"aretro",
				"exec",
				"collect-evidence",
				"--repo",
				cwd,
				"--branch",
				"demo-branch",
				"--session-root",
				sessionRoot,
				"--format",
				"json",
			],
			cwd,
		});
		expect(await collect.exit).toBe(0);
		expect(parseJsonOutput(collect)).toMatchObject({
			status: "ok",
			exitCode: 0,
			data: {
				repo: { repo_root: cwd, branch: "demo-branch", branch_source: "explicit" },
				aggregate_metrics: { session_count: 0 },
			},
		});
	});
});

async function createAretroProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-aretro-extension-project-"));
	tempDirs.push(directory);
	installCheckedInAretroExtension(directory);
	return directory;
}

function installCheckedInAretroExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".sdl", "extensions", "aretro");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(ARETRO_EXTENSION_SOURCE, destination, { recursive: true });
}

function runWithRealAretroExtension(options: { args: readonly string[]; cwd: string }) {
	return runCliWithFakes(options, {
		execResponses: () => aretroGitResponses(options.cwd),
		textGenerationResults: () => [],
	});
}

function aretroGitResponses(cwd: string): ScriptedExecResponse[] {
	return [{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } }];
}
