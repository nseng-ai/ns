import { rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInHandoffExtension } from "../helpers/handoff-extension.ts";
import { parseJsonOutput, runCliWithFakes } from "../scenario/ji-cli-fakes.ts";

const tempDirs: string[] = [];

const HANDOFF_LEAVES = ["list", "create", "pickup", "delete", "gc"] as const;

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in handoff SDL extension registry", () => {
	test("discovers the handoff group and imports a representative leaf", async () => {
		const cwd = await createHandoffProject();

		const help = runHandoffCli({ args: ["handoff", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ji handoff");
		for (const leaf of HANDOFF_LEAVES) expect(output).toContain(leaf);
		expect(help.stderr.join("")).toBe("");

		const schema = runHandoffCli({ args: ["handoff", "list", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
		expect(schema.stderr.join("")).toBe("");
	});
});

async function createHandoffProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ji-handoff-extension-"));
	tempDirs.push(directory);
	installCheckedInHandoffExtension(directory);
	return directory;
}

function runHandoffCli(options: { args: readonly string[]; cwd: string }) {
	return runCliWithFakes(
		{ args: options.args, cwd: options.cwd },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
			missingTextGenerationResult: () => ({ ok: false, error: "unexpected model call" }),
		},
	);
}
