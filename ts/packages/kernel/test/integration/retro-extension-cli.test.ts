import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInRetroExtension } from "../helpers/retro-extension.ts";
import {
	parseJsonOutput,
	runCliWithFakes,
	type ScriptedExecResponse,
} from "../scenario/ns-cli-fakes.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in Retro ns extension loading", () => {
	test("exposes hidden Retro exec command help through the ns command face", async () => {
		const cwd = await createRetroProject();

		const rootHelp = runWithRealRetroExtension({ args: ["retro", "--help"], cwd });
		expect(await rootHelp.exit).toBe(0);
		const rootOutput = rootHelp.stdout.join("");
		expect(rootOutput).toContain("Usage: ns retro");
		expect(rootOutput).not.toContain("collect-evidence");
		expect(rootOutput).not.toContain("read-evidence-detail");

		const collectHelp = runWithRealRetroExtension({
			args: ["retro", "exec", "collect-evidence", "--help"],
			cwd,
		});
		expect(await collectHelp.exit).toBe(0);
		const collectOutput = collectHelp.stdout.join("");
		expect(collectOutput).toContain("Usage: ns retro exec collect-evidence");
		expect(collectOutput).toContain("--repo");
		expect(collectOutput).toContain("--branch");
		expect(collectOutput).toContain("--session-root");

		const detailHelp = runWithRealRetroExtension({
			args: ["retro", "exec", "read-evidence-detail", "--help"],
			cwd,
		});
		expect(await detailHelp.exit).toBe(0);
		expect(detailHelp.stdout.join("")).toContain("Usage: ns retro exec read-evidence-detail");
	});

	test("publishes schema and runs collect-evidence through the ns command face", async () => {
		const cwd = await createRetroProject();
		const sessionRoot = join(cwd, "sessions");
		await mkdir(sessionRoot, { recursive: true });

		const schema = runWithRealRetroExtension({
			args: ["retro", "exec", "collect-evidence", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(schema.stdout.join("")).toContain("aggregateMetrics");

		const collect = runWithRealRetroExtension({
			args: [
				"retro",
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
				repo: { repoRoot: cwd, branch: "demo-branch", branchSource: "explicit" },
				aggregateMetrics: { sessionCount: 0 },
			},
		});
	});
});

async function createRetroProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-retro-extension-project-"));
	tempDirs.push(directory);
	installCheckedInRetroExtension(directory);
	return directory;
}

function runWithRealRetroExtension(options: { args: readonly string[]; cwd: string }) {
	return runCliWithFakes(options, {
		execResponses: () => retroGitResponses(options.cwd),
		textGenerationResults: () => [],
	});
}

function retroGitResponses(cwd: string): ScriptedExecResponse[] {
	return [{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } }];
}
