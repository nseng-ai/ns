import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInReviewsExtension } from "../helpers/reviews-extension.ts";
import { parseJsonOutput, runCliWithFakes } from "../scenario/ns-cli-fakes.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in Reviews ns extension loading", () => {
	test("real loader exposes selected Reviews list help", async () => {
		const cwd = await createReviewsProject();
		const run = runWithRealReviewsExtension({ args: ["reviews", "list", "--help"], cwd });

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: ns reviews list");
		expect(help).toContain("--applicable");
		expect(help).toContain("--ci");
		expect(help).toContain("--base-ref");
		expect(help).toContain("gateway-injected");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("real loader preserves Reviews nested and hidden command surfaces", async () => {
		const cwd = await createReviewsProject();
		const groupHelp = runWithRealReviewsExtension({ args: ["reviews", "review", "--help"], cwd });

		expect(await groupHelp.exit).toBe(0);
		const help = groupHelp.stdout.join("");
		expect(help).toContain("Usage: ns reviews review");
		expect(help).not.toContain("ls");
		expect(help).toContain("log");
		expect(help).toContain("run");
		expect(help).not.toContain("exec");
		expect(groupHelp.stderr.join("")).toBe("");

		const hiddenSchema = runWithRealReviewsExtension({
			args: ["reviews", "exec", "publish-findings", "--json-schema"],
			cwd,
		});
		expect(await hiddenSchema.exit).toBe(0);
		expect(parseJsonOutput(hiddenSchema)).toHaveProperty("inputJsonSchema");
		expect(hiddenSchema.stderr.join("")).toBe("");
	});
});

async function createReviewsProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-reviews-extension-project-"));
	tempDirs.push(directory);
	installCheckedInReviewsExtension(directory);
	return directory;
}

function runWithRealReviewsExtension(options: { args: readonly string[]; cwd: string }) {
	return runCliWithFakes(options, {
		execResponses: () => [],
		textGenerationResults: () => [],
	});
}
