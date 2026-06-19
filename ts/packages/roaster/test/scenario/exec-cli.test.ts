import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { FakeRoasterGitHubGateway, type RoasterGitHubGateway } from "../../src/gateways/github.ts";
import type { PRChangedFile, ReviewFinding } from "../../src/models.ts";
import { fakeRoasterContext } from "../support/fake-roaster-context.ts";
import { buildSuccessEnvelope } from "../support/findings-envelope.ts";

interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

async function runRoaster(
	args: readonly string[],
	options: { readonly stdin?: string; readonly github?: RoasterGitHubGateway } = {},
): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const exitCode = await runCli(args, {
		context: fakeRoasterContext({ github: options.github }),
		cwd: "/repo",
		env: {},
		stdin: async () => options.stdin ?? "",
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

const inlineFinding: ReviewFinding = {
	path: "app.py",
	line: 1,
	severity: "warning",
	summary: "Inline this",
	details: "This line is in the PR diff.",
};

const deletedCommands = [
	"post-inline-" + "findings",
	"format-findings-" + "comment",
	"post-findings-" + "comment",
];

describe("roaster exec CLI", () => {
	test("exec help lists publish and omits deleted commands", async () => {
		const run = await runRoaster(["exec", "--help"]);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("publish");
		for (const commandName of deletedCommands) {
			expect(run.stdout).not.toContain(commandName);
		}
	});

	test("publish posts inline findings and creates the summary comment", async () => {
		const changedFiles = new Map<number, readonly PRChangedFile[]>([
			[47, [{ path: "app.py", status: "modified", patch: "@@ -1 +1 @@\n+new" }]],
		]);
		const github = new FakeRoasterGitHubGateway({ changedFilesByPr: changedFiles });

		const run = await runRoaster(
			[
				"exec",
				"publish",
				"--pr-number",
				"47",
				"--review-name",
				"dignified-python",
				"--base-ref",
				"master",
				"--run-url",
				"https://run",
			],
			{
				stdin: buildSuccessEnvelope([inlineFinding], {
					reviewName: "dignified-python",
					reviewPath: "/repo/reviews/dignified-python.md",
					model: "sonnet",
					baseRef: "master",
				}),
				github,
			},
		);

		expect(run.exitCode).toBe(0);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("posted findings comment");
		expect(github.createdReviews()).toHaveLength(1);
		expect(github.createdReviews()[0]?.comments[0]?.body).toContain(
			"<!-- roaster-inline:dignified-python:",
		);
	});

	test("publish rejects malformed stdin", async () => {
		const run = await runRoaster(
			["exec", "publish", "--pr-number", "47", "--review-name", "review", "--base-ref", "main"],
			{ stdin: "not json" },
		);

		expect(run.exitCode).toBe(1);
		expect(run.stderr).toContain("publish:");
		expect(run.stderr).toContain("valid JSON");
	});
});
