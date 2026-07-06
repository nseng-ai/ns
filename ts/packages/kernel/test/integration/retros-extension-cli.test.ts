import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInRetrosExtension } from "../helpers/retros-extension.ts";
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

describe("checked-in Retros ns extension loading", () => {
	test("exposes hidden Retros exec command help through the ns command face", async () => {
		const cwd = await createRetrosProject();

		const rootHelp = runWithRealRetrosExtension({ args: ["retros", "--help"], cwd });
		expect(await rootHelp.exit).toBe(0);
		const rootOutput = rootHelp.stdout.join("");
		expect(rootOutput).toContain("Usage: ns retros");
		expect(rootOutput).not.toContain("collect-evidence");
		expect(rootOutput).not.toContain("read-evidence-detail");

		const collectHelp = runWithRealRetrosExtension({
			args: ["retros", "exec", "collect-evidence", "--help"],
			cwd,
		});
		expect(await collectHelp.exit).toBe(0);
		const collectOutput = collectHelp.stdout.join("");
		expect(collectOutput).toContain("Usage: ns retros exec collect-evidence");
		expect(collectOutput).toContain("--repo");
		expect(collectOutput).toContain("--branch");
		expect(collectOutput).toContain("--session-root");

		const detailHelp = runWithRealRetrosExtension({
			args: ["retros", "exec", "read-evidence-detail", "--help"],
			cwd,
		});
		expect(await detailHelp.exit).toBe(0);
		expect(detailHelp.stdout.join("")).toContain("Usage: ns retros exec read-evidence-detail");
	});

	test("publishes schema and runs collect-evidence through the ns command face", async () => {
		const cwd = await createRetrosProject();
		const sessionRoot = join(cwd, "sessions");
		await mkdir(sessionRoot, { recursive: true });

		const schema = runWithRealRetrosExtension({
			args: ["retros", "exec", "collect-evidence", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(schema.stdout.join("")).toContain("aggregateMetrics");

		const collect = runWithRealRetrosExtension({
			args: [
				"retros",
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

async function createRetrosProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-retros-extension-project-"));
	tempDirs.push(directory);
	installCheckedInRetrosExtension(directory);
	return directory;
}

function runWithRealRetrosExtension(options: { args: readonly string[]; cwd: string }) {
	return runCliWithFakes(options, {
		execResponses: () => retrosGitResponses(options.cwd),
		textGenerationResults: () => [],
	});
}

function retrosGitResponses(cwd: string): ScriptedExecResponse[] {
	return [{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } }];
}
