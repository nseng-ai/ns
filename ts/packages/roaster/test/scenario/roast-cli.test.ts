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
		expect(run.stdout).toContain("Roast skill entries: 6");
		expect(run.stdout).toContain(
			"- roast:thermonuclear-review — Roast: ThermonuclearReview (review: thermonuclear-review)",
		);
		expect(run.stdout).toContain(
			"- roast:improve-codebase-architecture — Roast: Improve codebase architecture (review: improve-codebase-architecture)",
		);
		expect(run.stdout).toContain(
			"- roast:asdl-typescript-style — Roast: ASDL TypeScript style (review: asdl-typescript-style)",
		);
		expect(run.stdout).toContain(
			"- roast:dignified-python — Roast: Dignified Python (review: dignified-python)",
		);
		expect(run.stdout).toContain(
			"- roast:dry-but-not-too-dry — Roast: DRY but not too DRY (review: dry-but-not-too-dry)",
		);
		expect(run.stdout).toContain(
			"- roast:duplicative-abstractions — Roast: Duplicative abstractions (review: duplicative-abstractions)",
		);
	});

	test("roast list renders JSON with review identifiers", async () => {
		const run = await runRoaster(["roast", "list", "--format", "json"]);

		expect(run.exitCode).toBe(0);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.data.count).toBe(6);
		expect(envelope.data.entries.map((entry: { surface: string }) => entry.surface)).toEqual([
			"roast:thermonuclear-review",
			"roast:improve-codebase-architecture",
			"roast:asdl-typescript-style",
			"roast:dignified-python",
			"roast:dry-but-not-too-dry",
			"roast:duplicative-abstractions",
		]);
		expect(envelope.data.entries[0]).toMatchObject({
			surface: "roast:thermonuclear-review",
			label: "Roast: ThermonuclearReview",
			review_key: "thermonuclear-review",
			review_path: "reviews/thermonuclear-review.md",
		});
		expect(envelope.data.entries[2]).toMatchObject({
			surface: "roast:asdl-typescript-style",
			label: "Roast: ASDL TypeScript style",
			review_key: "asdl-typescript-style",
			review_path: "reviews/asdl-typescript-style.md",
		});
	});
});
