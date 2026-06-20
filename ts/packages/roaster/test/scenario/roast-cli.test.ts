import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { RoasterContext } from "../../src/context.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

async function runRoaster(args: readonly string[]): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const baseContext = fakeRoasterContext();
	const context: RoasterContext = {
		...baseContext,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	};
	const exitCode = await runCli(args, { context });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("roaster roast CLI", () => {
	test("root help exposes roast and hides exec", async () => {
		const run = await runRoaster(["--help"]);

		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("review");
		expect(run.stdout).toContain("roast");
		expect(run.stdout).not.toContain("exec");
	});

	test("roast list renders human output", async () => {
		const run = await runRoaster(["roast", "list"]);

		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("Roast skill entries: 2");
		expect(run.stdout).toContain(
			"- roast:thermonuclear-review — Roast: ThermonuclearReview (skill: thermo-nuclear-code-quality-review)",
		);
		expect(run.stdout).toContain(
			"- roast:improve-codebase-architecture — Roast: Improve codebase architecture (skill: improve-codebase-architecture)",
		);
	});

	test("roast list renders JSON with snake-case skill names", async () => {
		const run = await runRoaster(["roast", "list", "--format", "json"]);

		expect(run.exitCode).toBe(0);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.data.count).toBe(2);
		expect(envelope.data.entries).toEqual([
			{
				surface: "roast:thermonuclear-review",
				label: "Roast: ThermonuclearReview",
				skill_name: "thermo-nuclear-code-quality-review",
				title: "ThermonuclearReview",
				description:
					"Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth.",
			},
			{
				surface: "roast:improve-codebase-architecture",
				label: "Roast: Improve codebase architecture",
				skill_name: "improve-codebase-architecture",
				title: "Improve codebase architecture",
				description:
					"Scan the codebase for architecture deepening opportunities and present an HTML report.",
			},
		]);
	});
});
