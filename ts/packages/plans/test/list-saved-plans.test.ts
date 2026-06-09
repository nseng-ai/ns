import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	listSavedPlans,
	normalizeRepoOriginUrl,
	runCli,
	sanitizePlanPathSegment,
	type ExecOptions,
	type GitCwdParams,
	type GitOptionalResult,
	type GitResult,
	type PlanCommandExecApi,
	type PlansGitGateway,
} from "../src/index.ts";

const ORIGIN = "git@github.com:Owner/Repo.git";
const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

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
		const olderPath = await writePlanFile({ fixture, branchKey: featureBranchKey, fileName: "first-useful-saved-plan.md", modifiedTimeMs: 1_700_000_000_000 });
		const newerPath = await writePlanFile({ fixture, branchKey: otherBranchKey, fileName: "second-useful-saved-plan.md", modifiedTimeMs: 1_800_000_000_000 });
		await writePlanFile({ fixture, branchKey: otherBranchKey, fileName: "ignore.txt", modifiedTimeMs: 1_900_000_000_000 });
		await mkdir(join(fixture.planStoreRoot, fixture.repoKey, otherBranchKey, "directory-saved-plan.md"));

		const plans = await listSavedPlans(unusedCommands, { cwd: fixture.repoRoot, git: fixture.git, planStoreRoot: fixture.planStoreRoot });

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
			stdout: help.stdout,
			stderr: help.stderr,
		});
		expect(helpExitCode).toBe(0);
		expect(help.stdoutText()).toContain("Usage: plans");
		expect(help.stdoutText()).toContain("list");

		const version = createOutputCapture();
		const versionExitCode = await runCli(["--version"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
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
			stdout: output.stdout,
			stderr: output.stderr,
		});

		expect(exitCode).toBe(0);
		expect(output.stderrText()).toBe("");
		expect(output.stdoutText()).toContain("Usage: plans list");
	});

	test("prints JSON failure for unknown JSON option", async () => {
		const fixture = await makeFixture();
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--format", "json", "--bogus"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			stdout: output.stdout,
			stderr: output.stderr,
		});

		expect(exitCode).toBe(2);
		expect(output.stderrText()).toBe("");
		expect(JSON.parse(output.stdoutText())).toEqual({
			success: false,
			error: { code: "plans_error", message: "Unknown option: --bogus" },
		});
	});

	test("prints an empty success message when no repo store exists", async () => {
		const fixture = await makeFixture();
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--plan-store-root", fixture.planStoreRoot], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
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
		const filePath = await writePlanFile({ fixture, branchKey, fileName: "first-useful-saved-plan.md", modifiedTimeMs: 1_700_000_000_000 });
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--plan-store-root", fixture.planStoreRoot], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
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
		const filePath = await writePlanFile({ fixture, branchKey, fileName: "first-useful-saved-plan.md", modifiedTimeMs: 1_700_000_000_000 });
		const output = createOutputCapture();

		const exitCode = await runCli(["list", "--format", "json", "--plan-store-root", fixture.planStoreRoot], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			stdout: output.stdout,
			stderr: output.stderr,
		});

		expect(exitCode).toBe(0);
		const payload = parseJsonListPayload(output.stdoutText());
		expect(payload).toMatchObject({
			success: true,
			plans: [
				{
					slug: "first-useful-saved-plan",
					branch_key: branchKey,
					path: filePath,
					file_name: "first-useful-saved-plan.md",
					repo: {
						key: "gh--owner--repo",
						identity_source: "origin-url",
					},
				},
			],
		});
		expect(payload.plans[0]?.modified_time_ms).toBe(1_700_000_000_000);
	});
});

describe("plans exec CLI", () => {
	test("write stores stdin content under the local plan store", async () => {
		const fixture = await makeFixture();
		const output = createOutputCapture();

		const exitCode = await runCli(["exec", "write", "--slug", "branch-scoped-plan", "--summary", "Save it", "--stdin", "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			stdin: () => Promise.resolve("# Plan\n\nDo it.\n"),
			stdout: output.stdout,
			stderr: output.stderr,
			planStoreRoot: fixture.planStoreRoot,
		});

		expect(exitCode).toBe(0);
		expect(output.stderrText()).toBe("");
		const payload = JSON.parse(output.stdoutText());
		expect(payload).toMatchObject({
			success: true,
			slug: "branch-scoped-plan",
			repo_key: "gh--owner--repo",
			source_branch: "feature/source-plan",
			branch_key: encodeBranchForPlanPath("feature/source-plan"),
			summary: "Save it",
		});
		expect(String(payload.file_path)).toContain(`${fixture.planStoreRoot}/gh--owner--repo/${encodeBranchForPlanPath("feature/source-plan")}/branch-scoped-plan.md`);
		expect(await readFile(String(payload.file_path), "utf8")).toBe("# Plan\n\nDo it.\n");
	});

	test("resolve returns explicit paths and the latest saved source-branch plan", async () => {
		const fixture = await makeFixture();
		const outsideDir = await makeTempDir();
		const explicitPlan = join(outsideDir, "explicit.md");
		await writeFile(explicitPlan, "# Explicit\n", "utf8");

		const explicitOutput = createOutputCapture();
		const explicitExitCode = await runCli(["exec", "resolve", explicitPlan, "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			stdout: explicitOutput.stdout,
			stderr: explicitOutput.stderr,
		});
		expect(explicitExitCode).toBe(0);
		expect(JSON.parse(explicitOutput.stdoutText())).toMatchObject({ success: true, source: "explicit", file_path: await realpath(explicitPlan) });

		const branchKey = encodeBranchForPlanPath("feature/source-plan");
		const older = await writePlanFile({ fixture, branchKey, fileName: "older-plan-file.md", modifiedTimeMs: 1_000 });
		const newer = await writePlanFile({ fixture, branchKey, fileName: "newer-plan-file.md", modifiedTimeMs: 2_000 });
		void older;

		const latestOutput = createOutputCapture();
		const latestExitCode = await runCli(["exec", "resolve", "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands: unusedCommands,
			stdout: latestOutput.stdout,
			stderr: latestOutput.stderr,
			planStoreRoot: fixture.planStoreRoot,
		});
		expect(latestExitCode).toBe(0);
		expect(JSON.parse(latestOutput.stdoutText())).toMatchObject({ success: true, source: "latest", slug: "newer-plan-file", file_path: newer });
	});
});

interface Fixture {
	repoRoot: string;
	planStoreRoot: string;
	repoKey: string;
	git: PlansGitGateway;
}

interface JsonListPayload {
	success: true;
	plans: JsonListPlan[];
}

interface JsonListPlan {
	modified_time_ms: number;
}

function parseJsonListPayload(text: string): JsonListPayload {
	const value: unknown = JSON.parse(text);
	if (!isJsonListPayload(value)) {
		throw new Error("Expected saved-plan JSON list payload.");
	}
	return value;
}

function isJsonListPayload(value: unknown): value is JsonListPayload {
	return isRecord(value) && value.success === true && Array.isArray(value.plans) && value.plans.every(isJsonListPlan);
}

function isJsonListPlan(value: unknown): value is JsonListPlan {
	return isRecord(value) && typeof value.modified_time_ms === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function makeFixture(): Promise<Fixture> {
	const repoRoot = await makeTempDir();
	const planStoreRoot = await makeTempDir();
	const repoKey = buildRepoPlanStoreKey(repoRoot, ORIGIN);
	return { repoRoot, planStoreRoot, repoKey, git: new FakePlansGitGateway(repoRoot, ORIGIN) };
}

async function makeTempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "plans-list-test-"));
	tempDirs.push(dir);
	return dir;
}

interface WritePlanFileOptions {
	fixture: Fixture;
	branchKey: string;
	fileName: string;
	modifiedTimeMs: number;
}

async function writePlanFile(options: WritePlanFileOptions): Promise<string> {
	const directory = join(options.fixture.planStoreRoot, options.fixture.repoKey, options.branchKey);
	await mkdir(directory, { recursive: true });
	const filePath = join(directory, options.fileName);
	await writeFile(filePath, `# ${options.fileName}\n`, "utf8");
	const modified = new Date(options.modifiedTimeMs);
	await utimes(filePath, modified, modified);
	return filePath;
}

function createOutputCapture(): { stdout: (text: string) => void; stderr: (text: string) => void; stdoutText: () => string; stderrText: () => string } {
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

const unusedCommands: PlanCommandExecApi = {
	exec(command: string, args: string[], options?: ExecOptions): Promise<never> {
		void command;
		void args;
		void options;
		throw new Error("Unexpected command execution in test.");
	},
};

class FakePlansGitGateway implements PlansGitGateway {
	private readonly repoRootValue: string;
	private readonly origin: string;

	constructor(repoRootValue: string, origin: string) {
		this.repoRootValue = repoRootValue;
		this.origin = origin;
	}

	repoRoot(params: GitCwdParams): Promise<GitResult<string>> {
		void params;
		return Promise.resolve({ ok: true, value: this.repoRootValue });
	}

	optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		void params;
		return Promise.resolve({ type: "found", value: this.repoRootValue });
	}

	currentBranch(params: GitCwdParams): Promise<GitResult<string>> {
		void params;
		return Promise.resolve({ ok: true, value: "feature/source-plan" });
	}

	originUrl(params: GitCwdParams): Promise<GitOptionalResult<string>> {
		void params;
		return Promise.resolve({ type: "found", value: this.origin });
	}
}
