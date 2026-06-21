import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import type { RoasterContext } from "../../src/context.ts";
import { FakeReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";

interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

const REVIEW_SOURCES = {
	"sdl-typescript-style": reviewSource("Enforce SDL's TypeScript style guide."),
	"dignified-python": reviewSource("Enforce dignified Python standards."),
	"dry-but-not-too-dry": reviewSource("Review duplicated code and structure."),
	"duplicative-abstractions": reviewSource("Scout for duplicated infrastructure."),
	"improve-codebase-architecture": reviewSource("Review architecture deepening opportunities."),
	"thermonuclear-review": reviewSource("Run an extremely strict maintainability review."),
} as const;

async function runRoaster(args: readonly string[]): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const baseContext = fakeRoasterContext({
		reviewCatalog: new FakeReviewCatalogGateway({ reviewSourcesByKey: REVIEW_SOURCES }),
	});
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
			"- skill:roast-sdl-typescript-style — Roast: SDL TypeScript style (review: sdl-typescript-style)",
		);
		expect(run.stdout).toContain(
			"- skill:roast-dignified-python — Roast: Dignified Python (review: dignified-python)",
		);
		expect(run.stdout).toContain(
			"- skill:roast-dry-but-not-too-dry — Roast: DRY but not too DRY (review: dry-but-not-too-dry)",
		);
		expect(run.stdout).toContain(
			"- skill:roast-duplicative-abstractions — Roast: Duplicative abstractions (review: duplicative-abstractions)",
		);
		expect(run.stdout).toContain(
			"- skill:roast-improve-codebase-architecture — Roast: Improve codebase architecture (review: improve-codebase-architecture)",
		);
		expect(run.stdout).toContain(
			"- skill:roast-thermonuclear-review — Roast: Thermonuclear review (review: thermonuclear-review)",
		);
	});

	test("roast list renders JSON with review identifiers", async () => {
		const run = await runRoaster(["roast", "list", "--format", "json"]);

		expect(run.exitCode).toBe(0);
		const envelope = JSON.parse(run.stdout);
		expect(envelope.data.count).toBe(6);
		expect(envelope.data.entries.map((entry: { surface: string }) => entry.surface)).toEqual(
			[
				"dignified-python",
				"dry-but-not-too-dry",
				"duplicative-abstractions",
				"improve-codebase-architecture",
				"sdl-typescript-style",
				"thermonuclear-review",
			].map((key) => `skill:roast-${key}`),
		);
		expect(envelope.data.entries[4]).toMatchObject({
			surface: "skill:roast-sdl-typescript-style",
			label: "Roast: SDL TypeScript style",
			review_key: "sdl-typescript-style",
			review_path: "reviews/sdl-typescript-style.md",
		});
		expect(envelope.data.entries[5]).toMatchObject({
			surface: "skill:roast-thermonuclear-review",
			label: "Roast: Thermonuclear review",
			review_key: "thermonuclear-review",
			review_path: "reviews/thermonuclear-review.md",
		});
	});
});

function reviewSource(description: string): string {
	return `---
description: ${JSON.stringify(description)}
---

# Review

Inspect the diff.
`;
}
