import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInRoasterExtension } from "../helpers/roaster-extension.ts";
import { parseJsonOutput, runCliWithFakes } from "../scenario/ji-cli-fakes.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in Roaster SDL extension loading", () => {
	test("real loader exposes selected Roaster review list help", async () => {
		const cwd = await createRoasterProject();
		const run = runWithRealRoasterExtension({ args: ["roaster", "review", "list", "--help"], cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ji roaster review list");
		expect(help).toContain("--applicable");
		expect(help).toContain("--ci");
		expect(help).toContain("--base-ref");
		expect(help).toContain("gateway-injected");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("real loader preserves Roaster nested and hidden command surfaces", async () => {
		const cwd = await createRoasterProject();
		const groupHelp = runWithRealRoasterExtension({ args: ["roaster", "review", "--help"], cwd });

		expect(await groupHelp.exit).toBe(0);
		const help = groupHelp.stdout.join("");
		expect(help).toContain("Usage: ji roaster review");
		expect(help).toContain("list");
		expect(help).toContain("ls");
		expect(help).toContain("log");
		expect(help).toContain("run");
		expect(help).not.toContain("exec");
		expect(groupHelp.stderr.join("")).toBe("");

		const hiddenSchema = runWithRealRoasterExtension({
			args: ["roaster", "exec", "publish-findings", "--json-schema"],
			cwd,
		});
		expect(await hiddenSchema.exit).toBe(0);
		expect(parseJsonOutput(hiddenSchema)).toHaveProperty("inputJsonSchema");
		expect(hiddenSchema.stderr.join("")).toBe("");
	});
});

async function createRoasterProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ji-roaster-extension-project-"));
	tempDirs.push(directory);
	installCheckedInRoasterExtension(directory);
	return directory;
}

function runWithRealRoasterExtension(options: { args: readonly string[]; cwd: string }) {
	return runCliWithFakes(options, {
		execResponses: () => [],
		textGenerationResults: () => [],
	});
}
