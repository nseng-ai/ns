import { describe, expect, test } from "vitest";
import { join } from "node:path";

import type { CommandExecApi, ExecOptions } from "@sdl/core/exec";
import type { GitGateway } from "@sdl/core/git";
import { InMemoryGitGateway } from "@sdl/core/git/testing";
import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	listSavedPlans,
	normalizeRepoOriginUrl,
	runCli,
	sanitizePlanPathSegment,
} from "../src/index.ts";
import { InMemoryPlanStoreGateway } from "../src/testing.ts";

const ORIGIN = "git@github.com:Owner/Repo.git";
const SOURCE_BRANCH = "feature/source-plan";
describe("plan-store key helpers", () => {
	test("normalizes GitHub SSH remotes into stable repo store keys", async () => {
		const repoRoot = await makeTempDir();

		expect(normalizeRepoOriginUrl(ORIGIN)).toBe("ssh://git@github.com/Owner/Repo");
		expect(buildRepoPlanStoreKey(repoRoot, ORIGIN)).toBe("gh--owner--repo");
	});

	test("encodes branch paths and sanitizes unsafe path segments", () => {
		expect(encodeBranchForPlanPath("feature/my plan/éxample")).toBe("feature---my-plan---example");
		expect(sanitizePlanPathSegment("../", "fallback.value")).toBe("fallback.value");
	});
});

describe("listSavedPlans", () => {
	test("lists saved plans for the current repo across all branch-key directories", async () => {
		const fixture = await makeFixture();
		const featureBranchKey = encodeBranchForPlanPath("feature/source-plan");
		const otherBranchKey = encodeBranchForPlanPath("bugfix/other-plan");
		const olderPath = await writePlanFile({
			fixture,
			branchKey: featureBranchKey,
			fileName: "first-useful-saved-plan.md",
			modifiedTimeMs: 1_700_000_000_000,
		});
		const newerPath = await writePlanFile({
			fixture,
			branchKey: otherBranchKey,
			fileName: "second-useful-saved-plan.md",
			modifiedTimeMs: 1_800_000_000_000,
		});
		await writePlanFile({
			fixture,
			branchKey: otherBranchKey,
			fileName: "ignore.txt",
			modifiedTimeMs: 1_900_000_000_000,
		});
		fixture.planStoreGateway.mkdir(
			join(fixture.planStoreRoot, fixture.repoKey, otherBranchKey, "directory-saved-plan.md"),
		);

		const plans = await listSavedPlans(unusedCommands, {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
			planStoreGateway: fixture.planStoreGateway,
		});

		expect(plans).toMatchObject([
			{
				slug: "second-useful-saved-plan",
				branchKey: otherBranchKey,
				fileName: "second-useful-saved-plan.md",
				filePath: newerPath,
			},
			{
				slug: "first-useful-saved-plan",
				branchKey: featureBranchKey,
				fileName: "first-useful-saved-plan.md",
				filePath: olderPath,
			},
		]);
	});
});

describe("plans list CLI", () => {
	test("prints help and version", async () => {
		const fixture = await makeFixture();
		const help = createOutputCapture();
		const helpExitCode = await runCli(["--help"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: help.stdout,
			stderr: help.stderr,
		});
		expect(helpExitCode).toBe(0);
		expect(help.stdoutText()).toContain("Usage: enriched-plan");
		expect(help.stdoutText()).toContain("list");

		const version = createOutputCapture();
		const versionExitCode = await runCli(["--version"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: version.stdout,
			stderr: version.stderr,
		});
		expect(versionExitCode).toBe(0);
		expect(version.stdoutText()).toBe("0.1.0\n");
	});

	test("prints list help", async () => {
		const fixture = await makeFixture();
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--help"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: output.stdout,
			stderr: output.stderr,
		});

		expect(exitCode).toBe(0);
		expect(output.stderrText()).toBe("");
		expect(output.stdoutText()).toContain("Usage: enriched-plan list");
	});

	test("prints raw usage error for unknown JSON option", async () => {
		const fixture = await makeFixture();
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--format", "json", "--bogus"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: output.stdout,
			stderr: output.stderr,
		});

		expect(exitCode).toBe(2);
		expect(JSON.parse(output.stdoutText())).toMatchObject({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			message: "error: unknown option '--bogus'",
		});
		expect(output.stderrText()).toBe("error: unknown option '--bogus'\n");
	});

	test("prints an empty success message when no repo store exists", async () => {
		const fixture = await makeFixture();
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--plan-store-root", fixture.planStoreRoot], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: output.stdout,
			stderr: output.stderr,
		});

		expect(exitCode).toBe(0);
		expect(output.stderrText()).toBe("");
		expect(output.stdoutText()).toBe("No saved plans found for the current repository.\n");
	});

	test("prints default text without kind", async () => {
		const fixture = await makeFixture();
		const branchKey = encodeBranchForPlanPath("feature/source-plan");
		const filePath = await writePlanFile({
			fixture,
			branchKey,
			fileName: "first-useful-saved-plan.md",
			modifiedTimeMs: 1_700_000_000_000,
		});
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--plan-store-root", fixture.planStoreRoot], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: output.stdout,
			stderr: output.stderr,
		});

		expect(exitCode).toBe(0);
		expect(output.stderrText()).toBe("");
		expect(output.stdoutText()).toContain("first-useful-saved-plan");
		expect(output.stdoutText()).toContain(`Branch key: ${branchKey}`);
		expect(output.stdoutText()).toContain(`Path: ${filePath}`);
		expect(output.stdoutText()).not.toContain("Kind");
		expect(output.stdoutText()).not.toContain("markdown");
	});

	test("prints JSON with snake_case fields", async () => {
		const fixture = await makeFixture();
		const branchKey = encodeBranchForPlanPath("feature/source-plan");
		const filePath = await writePlanFile({
			fixture,
			branchKey,
			fileName: "first-useful-saved-plan.md",
			modifiedTimeMs: 1_700_000_000_000,
		});
		const output = createOutputCapture();

		const exitCode = await runCli(
			["list", "--format", "json", "--plan-store-root", fixture.planStoreRoot],
			{
				cwd: fixture.repoRoot,
				git: fixture.git,
				commands: unusedCommands,
				planStoreGateway: fixture.planStoreGateway,
				stdout: output.stdout,
				stderr: output.stderr,
			},
		);

		expect(exitCode).toBe(0);
		const payload = parseJsonListPayload(output.stdoutText());
		expect(payload).toMatchObject({
			exitCode: 0,
			data: {
				plans: [
					{
						slug: "first-useful-saved-plan",
						branchKey: branchKey,
						path: filePath,
						fileName: "first-useful-saved-plan.md",
						repo: {
							key: "gh--owner--repo",
							identitySource: "origin-url",
						},
					},
				],
			},
		});
		expect(payload.data.plans[0]?.modifiedTimeMs).toBe(1_700_000_000_000);
	});
});

describe("plans exec CLI", () => {
	test("write stores stdin content under the local plan store", async () => {
		const fixture = await makeFixture();
		const output = createOutputCapture();

		const exitCode = await runCli(
			[
				"exec",
				"save",
				"--slug",
				"branch-scoped-plan",
				"--summary",
				"Save it",
				"--stdin",
				"--format",
				"json",
			],
			{
				cwd: fixture.repoRoot,
				git: fixture.git,
				commands: unusedCommands,
				stdin: () => Promise.resolve("# Plan\n\nDo it.\n"),
				stdout: output.stdout,
				stderr: output.stderr,
				planStoreRoot: fixture.planStoreRoot,
				planStoreGateway: fixture.planStoreGateway,
			},
		);

		expect(exitCode).toBe(0);
		expect(output.stderrText()).toBe("");
		const payload = JSON.parse(output.stdoutText());
		expect(payload).toMatchObject({
			exitCode: 0,
			data: {
				slug: "branch-scoped-plan",
				repoKey: "gh--owner--repo",
				sourceBranch: "feature/source-plan",
				branchKey: encodeBranchForPlanPath("feature/source-plan"),
				summary: "Save it",
			},
		});
		expect(String(payload.data.filePath)).toContain(
			`${fixture.planStoreRoot}/gh--owner--repo/${encodeBranchForPlanPath("feature/source-plan")}/branch-scoped-plan.md`,
		);
		expect(fixture.planStoreGateway.readFile(String(payload.data.filePath))).toBe(
			"# Plan\n\nDo it.\n",
		);
	});

	test("resolve returns explicit paths and the latest saved source-branch plan", async () => {
		const fixture = await makeFixture();
		const outsideDir = makeTempDir();
		const explicitPlan = join(outsideDir, "explicit.md");
		fixture.planStoreGateway.writeFile(explicitPlan, "# Explicit\n");

		const explicitOutput = createOutputCapture();
		const explicitExitCode = await runCli(["exec", "resolve", explicitPlan, "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: explicitOutput.stdout,
			stderr: explicitOutput.stderr,
		});
		expect(explicitExitCode).toBe(0);
		expect(JSON.parse(explicitOutput.stdoutText())).toMatchObject({
			exitCode: 0,
			data: {
				source: "explicit",
				filePath: explicitPlan,
			},
		});

		const branchKey = encodeBranchForPlanPath("feature/source-plan");
		const older = await writePlanFile({
			fixture,
			branchKey,
			fileName: "older-plan-file.md",
			modifiedTimeMs: 1_000,
		});
		const newer = await writePlanFile({
			fixture,
			branchKey,
			fileName: "newer-plan-file.md",
			modifiedTimeMs: 2_000,
		});
		void older;

		const latestOutput = createOutputCapture();
		const latestExitCode = await runCli(["exec", "resolve", "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			planStoreGateway: fixture.planStoreGateway,
			stdout: latestOutput.stdout,
			stderr: latestOutput.stderr,
			planStoreRoot: fixture.planStoreRoot,
		});
		expect(latestExitCode).toBe(0);
		expect(JSON.parse(latestOutput.stdoutText())).toMatchObject({
			exitCode: 0,
			data: {
				source: "latest",
				slug: "newer-plan-file",
				filePath: newer,
			},
		});
	});
});

interface Fixture {
	repoRoot: string;
	planStoreRoot: string;
	repoKey: string;
	git: GitGateway;
	planStoreGateway: InMemoryPlanStoreGateway;
}

interface JsonListPayload {
	exitCode: 0;
	data: { plans: JsonListPlan[] };
}

interface JsonListPlan {
	modifiedTimeMs: number;
}

function parseJsonListPayload(text: string): JsonListPayload {
	const value: unknown = JSON.parse(text);
	if (!isJsonListPayload(value)) {
		throw new Error("Expected saved-plan JSON list payload.");
	}
	return value;
}

function isJsonListPayload(value: unknown): value is JsonListPayload {
	return (
		isRecord(value) &&
		value.exitCode === 0 &&
		isRecord(value.data) &&
		Array.isArray(value.data.plans) &&
		value.data.plans.every(isJsonListPlan)
	);
}

function isJsonListPlan(value: unknown): value is JsonListPlan {
	return isRecord(value) && typeof value.modifiedTimeMs === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function makeFixture(): Promise<Fixture> {
	const repoRoot = makeTempDir();
	const planStoreRoot = makeTempDir();
	const repoKey = buildRepoPlanStoreKey(repoRoot, ORIGIN);
	return {
		repoRoot,
		planStoreRoot,
		repoKey,
		git: new InMemoryGitGateway({ repoRoot, originUrl: ORIGIN, currentBranch: SOURCE_BRANCH }),
		planStoreGateway: new InMemoryPlanStoreGateway(),
	};
}

let tempDirCounter = 0;
function makeTempDir(): string {
	tempDirCounter += 1;
	return `/plans-list-test-${tempDirCounter}`;
}

interface WritePlanFileOptions {
	fixture: Fixture;
	branchKey: string;
	fileName: string;
	modifiedTimeMs: number;
}

async function writePlanFile(options: WritePlanFileOptions): Promise<string> {
	const directory = join(options.fixture.planStoreRoot, options.fixture.repoKey, options.branchKey);
	const filePath = join(directory, options.fileName);
	options.fixture.planStoreGateway.writeFile(filePath, `# ${options.fileName}\n`, {
		mtimeMs: options.modifiedTimeMs,
	});
	return filePath;
}

function createOutputCapture(): {
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	stdoutText: () => string;
	stderrText: () => string;
} {
	let stdout = "";
	let stderr = "";
	return {
		stdout: (text: string) => {
			stdout += text;
		},
		stderr: (text: string) => {
			stderr += text;
		},
		stdoutText: () => stdout,
		stderrText: () => stderr,
	};
}

const unusedCommands: CommandExecApi = {
	exec(command: string, args: string[], options?: ExecOptions): Promise<never> {
		void command;
		void args;
		void options;
		throw new Error("Unexpected command execution in test.");
	},
};
