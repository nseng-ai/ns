import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
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
		const payload = JSON.parse(output.stdoutText()) as JsonListPayload;
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

interface Fixture {
	repoRoot: string;
	planStoreRoot: string;
	repoKey: string;
	git: PlansGitGateway;
}

interface JsonListPayload {
	success: true;
	plans: Array<{ modified_time_ms: number }>;
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
