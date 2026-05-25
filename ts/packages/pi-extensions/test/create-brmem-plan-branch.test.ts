import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import createBrmemPlanBranchExtension, {
	CREATE_PLANNED_BRANCH_USAGE,
	PLAN_BRANCH_NAMESPACE,
	buildWritePlanPrompt,
	buildRepoArchiveKey,
	encodeBranchForPlanPath,
	findLatestSourceBranchPlanFile,
	formatCreatePlannedBranchPreview,
	formatPlanBranchEvidence,
	formatSourceBranchPlanFileEvidence,
	isPathInside,
	normalizeRepoOriginUrl,
	parseCreatePlannedBranchArgs,
	validatePlanSlug,
	writeSourceBranchPlanFile,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type SourceBranchPlanFileEvidence,
	type ToolDefinition,
} from "../src/create-brmem-plan-branch.ts";
import type { ExecOptions } from "../src/brmem-plans/plan-persistence.ts";

const ROOT = "/repo";
const PLAN_SLUG = "branch-scoped-plan-extension";
const PLAN_KEY = `${PLAN_SLUG}.md`;
const START_POINT = "0123456789abcdef0123456789abcdef01234567";
const SOURCE_BRANCH = "source-branch";
const TARGET_BRANCH = "brmem-plans/wire-create-plan-branch-command";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type SendMessage = NonNullable<ExtensionAPI["sendMessage"]>;
type SentMessage = Parameters<SendMessage>[0] & { options?: Parameters<SendMessage>[1] };

type ExecCall = {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
};

type ScriptedExec =
	| {
			command: string;
			args: string[];
			result: Partial<ExecResult>;
	  }
	| {
			command: string;
			args: string[];
			error: Error;
	  };

type Notification = {
	message: string;
	level: string | undefined;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly execCalls: ExecCall[] = [];
	readonly sentMessages: SentMessage[] = [];
	readonly sentUserMessages: string[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly events: string[] | undefined;

	constructor(script: ScriptedExec[] = [], events?: string[]) {
		this.script = [...script];
		this.events = events;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: ToolDefinition): void {
		this.tools.set(definition.name, definition);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}

		if ("error" in expected) {
			throw expected.error;
		}

		return execResult(expected.result);
	}

	sendMessage(message: Parameters<SendMessage>[0], options?: Parameters<SendMessage>[1]): void {
		this.events?.push("message");
		if (options === undefined) {
			this.sentMessages.push(message);
			return;
		}
		this.sentMessages.push({ ...message, options });
	}

	sendUserMessage(content: string): void {
		this.events?.push("send");
		this.sentUserMessages.push(content);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

const tempDirs: string[] = [];

afterEach(async () => {
	const dirs = tempDirs.splice(0);
	await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function gitRootStep(root: string = ROOT): ScriptedExec {
	return step("git", ["rev-parse", "--show-toplevel"], { stdout: `${root}\n` });
}

function gitCurrentBranchStep(branch: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n`, ...result });
}

function gitOriginStep(result: Partial<ExecResult> = { stdout: "git@github.com:owner/repo.git\n" }): ScriptedExec {
	return step("git", ["config", "--get", "remote.origin.url"], result);
}

function refFormatStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["check-ref-format", "--branch", branch], result);
}

function headStep(result: Partial<ExecResult> = { stdout: `${START_POINT}\n` }): ScriptedExec {
	return step("git", ["rev-parse", "HEAD"], result);
}

function localBranchCheckStep(branch: string, result: Partial<ExecResult>): ScriptedExec {
	return step("git", ["rev-parse", "--verify", `refs/heads/${branch}`], result);
}

function brmemCheckStep(branch: string, key: string, result: Partial<ExecResult>): ScriptedExec {
	return step("brmem", ["check", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--format", "json"], result);
}

function gitBranchStep(branch: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["branch", branch, "HEAD"], result);
}

function gtTrackStep(branch: string, parent: string = SOURCE_BRANCH, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("gt", ["track", branch, "--parent", parent, "--no-interactive"], result);
}

function brmemPutStep(branch: string, key: string, filePath: string, result: Partial<ExecResult>): ScriptedExec {
	return step(
		"brmem",
		["put", key, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", branch, "--file", filePath, "--format", "json"],
		result,
	);
}

async function makeTempDir(prefix = "create-brmem-plan-branch-"): Promise<string> {
	const dir = await realpath(await mkdtemp(join(tmpdir(), prefix)));
	tempDirs.push(dir);
	return dir;
}

async function makeNamedPlanFile(fileName = `${PLAN_SLUG}.md`, content = "# Test Plan\n\nDo the work.\n"): Promise<string> {
	const dir = await makeTempDir();
	const filePath = join(dir, fileName);
	await writeFile(filePath, content, "utf8");
	return filePath;
}

function sourceArchiveDirectory(archiveRoot: string, sourceBranch: string, origin = "git@github.com:owner/repo.git"): string {
	const repoKey = buildRepoArchiveKey(ROOT, normalizeRepoOriginUrl(origin));
	const branchKey = encodeBranchForPlanPath(sourceBranch);
	return join(archiveRoot, repoKey, branchKey);
}

async function writeArchivePlanFile(directoryPath: string, fileName: string, modifiedTimeMs: number): Promise<string> {
	await mkdir(directoryPath, { recursive: true });
	const filePath = join(directoryPath, fileName);
	await writeFile(filePath, `# ${fileName}\n`, "utf8");
	const modified = new Date(modifiedTimeMs);
	await utimes(filePath, modified, modified);
	return filePath;
}

function sourcePlanEvidence(input: { slug: string; filePath: string; sourceBranch: string; origin?: string }): SourceBranchPlanFileEvidence {
	const origin = input.origin ?? "git@github.com:owner/repo.git";
	return {
		slug: input.slug,
		repoRoot: ROOT,
		repoKey: buildRepoArchiveKey(ROOT, normalizeRepoOriginUrl(origin)),
		repoIdentitySource: "origin-url",
		sourceBranch: input.sourceBranch,
		branchKey: encodeBranchForPlanPath(input.sourceBranch),
		filePath: input.filePath,
	};
}

function sourcePlanToolResultEntry(evidence: SourceBranchPlanFileEvidence): unknown {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolName: "write_source_branch_plan_file",
			isError: false,
			content: [],
			details: evidence,
		},
	};
}

function latestPlanBranchCustomMessageEntry(content: string): unknown {
	return {
		type: "message",
		message: {
			role: "custom",
			customType: "planned-branch-output",
			display: true,
			content,
		},
	};
}

function putEnvelope(input: { branch: string; key: string; filePath: string; commit?: string; refName?: string }): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: PLAN_BRANCH_NAMESPACE,
			key: input.key,
			branch: input.branch,
			ref_name: input.refName ?? `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/${input.branch.replaceAll("/", "---")}:${input.key}`,
			commit: input.commit ?? "abc123",
			source_file: input.filePath,
		},
	});
}

function successScript(input: { branch: string; key: string; filePath: string; putStdout?: string }): ScriptedExec[] {
	return [
		gitRootStep(),
		refFormatStep(input.branch),
		headStep(),
		localBranchCheckStep(input.branch, { code: 1, stderr: "absent" }),
		brmemCheckStep(input.branch, input.key, { code: 1, stderr: "absent" }),
		gitBranchStep(input.branch),
		brmemPutStep(input.branch, input.key, input.filePath, {
			stdout: input.putStdout ?? putEnvelope({ branch: input.branch, key: input.key, filePath: input.filePath }),
		}),
	];
}

function graphiteSuccessScript(input: { branch: string; key: string; filePath: string; putStdout?: string }): ScriptedExec[] {
	return [
		gitRootStep(),
		refFormatStep(input.branch),
		headStep(),
		localBranchCheckStep(input.branch, { code: 1, stderr: "absent" }),
		brmemCheckStep(input.branch, input.key, { code: 1, stderr: "absent" }),
		gitCurrentBranchStep(),
		gitBranchStep(input.branch),
		gtTrackStep(input.branch),
		brmemPutStep(input.branch, input.key, input.filePath, {
			stdout: input.putStdout ?? putEnvelope({ branch: input.branch, key: input.key, filePath: input.filePath }),
		}),
	];
}

function createContext(
	events: string[] = [],
	options: {
		hasUI?: boolean;
		cwd?: string;
		confirm?: (title: string, message?: string) => Promise<boolean>;
		sessionEntries?: unknown[];
	} = {},
): { ctx: CommandContext; notifications: Notification[]; statuses: Array<{ key: string; value: string | undefined }>; waits: () => number } {
	const notifications: Notification[] = [];
	const statuses: Array<{ key: string; value: string | undefined }> = [];
	let waitCount = 0;
	const ui: CommandContext["ui"] = {
		notify(message, level): void {
			events.push("notify");
			notifications.push({ message, level });
		},
		setStatus(key, value): void {
			events.push("status");
			statuses.push({ key, value });
		},
	};
	if (options.confirm !== undefined) {
		ui.confirm = async (title, message) => {
			events.push("confirm");
			return options.confirm?.(title, message) ?? false;
		};
	}

	const ctx: CommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		ui,
		async waitForIdle(): Promise<void> {
			events.push("wait");
			waitCount += 1;
		},
	};
	const sessionEntries = options.sessionEntries;
	if (sessionEntries !== undefined) {
		ctx.sessionManager = {
			getBranch: () => [...sessionEntries],
		};
	}
	return { ctx, notifications, statuses, waits: () => waitCount };
}

function registeredTool(pi: FakePi, name = "write_source_branch_plan_file"): ToolDefinition {
	const tool = pi.tools.get(name);
	expect(tool).toBeDefined();
	if (!tool) {
		throw new Error(`${name} was not registered`);
	}
	return tool;
}

describe("validatePlanSlug", () => {
	test("accepts specific 3-7 word kebab slugs", () => {
		for (const slug of [
			"branch-scoped-plan-extension",
			"brmem-backed-plan-command",
			"semantic-plan-persistence-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeUndefined();
		}
	});

	test("rejects invalid slug shapes", () => {
		for (const slug of [
			"",
			"Branch-Scoped-Plan",
			"branch scoped plan",
			"branch-scoped-plan.md",
			"brmem-plan",
			"one-two-three-four-five-six-seven-eight",
			"implementation-plan-task",
			"branch-2026-plan-tool",
		]) {
			expect(validatePlanSlug(slug)).toBeDefined();
		}
	});
});

describe("source branch plan path helpers", () => {
	test("normalizes repository origin URLs deterministically", () => {
		expect(normalizeRepoOriginUrl("git@github.com:owner/repo.git")).toBe("ssh://git@github.com/owner/repo");
		expect(normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git")).toBe("https://github.com/Owner/Repo");
		expect(normalizeRepoOriginUrl("https://github.com/owner/repo.git///")).toBe("https://github.com/owner/repo");
	});

	test("encodes branch names as one safe path segment", () => {
		expect(encodeBranchForPlanPath("main")).toBe("main");
		expect(encodeBranchForPlanPath("brmem-plans/add-widget")).toBe("brmem-plans---add-widget");
		expect(encodeBranchForPlanPath("feature/add widget+docs")).toBe("feature---add-widget-docs");
	});

	test("builds GitHub repo archive keys from owner and repo", () => {
		const scpLike = buildRepoArchiveKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/repo.git"));
		const https = buildRepoArchiveKey("/workspace/repo", normalizeRepoOriginUrl("https://github.com/owner/repo.git"));
		const mixedCaseHttps = buildRepoArchiveKey("/workspace/repo", normalizeRepoOriginUrl("HTTPS://github.com/Owner/Repo.git"));
		const different = buildRepoArchiveKey("/workspace/repo", normalizeRepoOriginUrl("git@github.com:owner/other.git"));

		expect(scpLike).toBe("gh--owner--repo");
		expect(https).toBe(scpLike);
		expect(mixedCaseHttps).toBe(scpLike);
		expect(different).toBe("gh--owner--other");
	});

	test("builds deterministic non-GitHub fallback archive keys without hashes", () => {
		expect(buildRepoArchiveKey("/workspace/repo", normalizeRepoOriginUrl("git@gitlab.com:Owner/Repo.git"))).toBe(
			"ssh-git-gitlab.com-Owner-Repo",
		);
		expect(buildRepoArchiveKey("/repo", "/repo")).toBe("repo");
	});

	test("finds the newest saved Markdown plan file", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "brmem-plans/add-widget";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		await writeArchivePlanFile(directoryPath, "older-source-plan.md", 1_700_000_000_000);
		const newestPath = await writeArchivePlanFile(directoryPath, "newer-source-plan.md", 1_800_000_000_000);
		await writeArchivePlanFile(directoryPath, "ignored-source-plan.txt", 1_900_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSourceBranchPlanFile(pi, { cwd: ROOT, archiveRoot });

		pi.assertDone();
		expect(evidence).toMatchObject({
			slug: "newer-source-plan",
			filePath: newestPath,
			fileName: "newer-source-plan.md",
			repoKey: "gh--owner--repo",
			sourceBranch,
			branchKey: "brmem-plans---add-widget",
			directoryPath,
		});
	});

	test("reports a clear error when the local plan store directory is missing", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		await expect(findLatestSourceBranchPlanFile(pi, { cwd: ROOT, archiveRoot })).rejects.toThrow(
			/No local plan store directory exists[\s\S]*Run \/write-plan first/,
		);
		pi.assertDone();
	});

	test("reports a clear error when no Markdown saved plans exist", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		await mkdir(directoryPath, { recursive: true });
		await writeFile(join(directoryPath, "notes.txt"), "not a plan", "utf8");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		await expect(findLatestSourceBranchPlanFile(pi, { cwd: ROOT, archiveRoot })).rejects.toThrow(
			/No Markdown saved plan files exist[\s\S]*Run \/write-plan first/,
		);
		pi.assertDone();
	});

	test("rejects an invalid latest filename slug", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		await writeArchivePlanFile(directoryPath, "valid-source-plan.md", 1_700_000_000_000);
		await writeArchivePlanFile(directoryPath, "bad.md", 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		await expect(findLatestSourceBranchPlanFile(pi, { cwd: ROOT, archiveRoot })).rejects.toThrow(
			/Latest saved plan filename has an invalid slug[\s\S]*bad\.md/,
		);
		pi.assertDone();
	});

	test("tie-breaks exact matching mtimes by filename path", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		await writeArchivePlanFile(directoryPath, "alpha-source-plan.md", 1_800_000_000_000);
		const expectedPath = await writeArchivePlanFile(directoryPath, "zeta-source-plan.md", 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);

		const evidence = await findLatestSourceBranchPlanFile(pi, { cwd: ROOT, archiveRoot });

		pi.assertDone();
		expect(evidence.slug).toBe("zeta-source-plan");
		expect(evidence.filePath).toBe(expectedPath);
	});
});

describe("create-planned-branch argument parsing", () => {
	test("parses empty args and supported flags", () => {
		expect(parseCreatePlannedBranchArgs("")).toEqual({ help: false, dryRun: false, yes: false });
		expect(parseCreatePlannedBranchArgs("--dry-run --yes --graphite --branch brmem-plans/add-widget /tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: true,
			yes: true,
			branchCreation: "graphite",
			branchName: "brmem-plans/add-widget",
			filePath: "/tmp/my-source-plan.md",
		});
		expect(parseCreatePlannedBranchArgs("-y --plain-git --branch=brmem-plans/add-widget @/tmp/my-source-plan.md")).toEqual({
			help: false,
			dryRun: false,
			yes: true,
			branchCreation: "plain-git",
			branchName: "brmem-plans/add-widget",
			filePath: "@/tmp/my-source-plan.md",
		});
		expect(parseCreatePlannedBranchArgs("--help").help).toBe(true);
		expect(parseCreatePlannedBranchArgs("-h").help).toBe(true);
	});

	test("rejects parse errors before mutation", () => {
		expect(() => parseCreatePlannedBranchArgs("--graphite --plain-git")).toThrow("Cannot pass both");
		expect(() => parseCreatePlannedBranchArgs("--unknown")).toThrow("Unknown flag");
		expect(() => parseCreatePlannedBranchArgs("--branch")).toThrow("Missing value");
		expect(() => parseCreatePlannedBranchArgs("/tmp/one.md /tmp/two.md")).toThrow("at most one");
	});
});

describe("buildWritePlanPrompt", () => {
	test("includes local plan store instructions without branch creation", () => {
		const prompt = buildWritePlanPrompt("add a tiny docs note plan for testing");

		expect(prompt).toContain("/write-plan request");
		expect(prompt).toContain("add a tiny docs note plan for testing");
		expect(prompt).toContain("write_source_branch_plan_file");
		expect(prompt).toContain("~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md");
		expect(prompt).not.toContain("create_brmem_plan_branch_from_file");
		expect(prompt).not.toContain("branchCreation");
	});

	test("renders empty steering as none", () => {
		expect(buildWritePlanPrompt("   ")).toContain("User steering for this planning request: (none)");
	});
});

describe("formatCreatePlannedBranchPreview", () => {
	test("reports latest saved plan and target details", () => {
		const text = formatCreatePlannedBranchPreview({
			mode: "latest",
			slug: PLAN_SLUG,
			filePath: `/archive/gh--owner--repo/main/${PLAN_KEY}`,
			fileName: PLAN_KEY,
			targetBranch: TARGET_BRANCH,
			branchCreation: "graphite",
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "main",
			branchKey: "main",
			modifiedTimeMs: 1_800_000_000_000,
		});

		expect(text).toContain("Latest saved plan from local plan store:");
		expect(text).toContain(`Path: /archive/gh--owner--repo/main/${PLAN_KEY}`);
		expect(text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain("Modified: 2027-01-15T08:00:00.000Z");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Branch Memory key: ${PLAN_KEY}`);
	});

	test("reports session-derived latest saved plan", () => {
		const text = formatCreatePlannedBranchPreview({
			mode: "session",
			slug: PLAN_SLUG,
			filePath: `/archive/gh--owner--repo/main/${PLAN_KEY}`,
			fileName: PLAN_KEY,
			targetBranch: TARGET_BRANCH,
			branchCreation: "plain-git",
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "main",
			branchKey: "main",
			modifiedTimeMs: 1_800_000_000_000,
		});

		expect(text).toContain("Saved plan from current session:");
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain("Source branch: main");
		expect(text).toContain("Modified: 2027-01-15T08:00:00.000Z");
	});
});

describe("formatPlanBranchEvidence", () => {
	test("reports all created branch and Branch Memory evidence", () => {
		const text = formatPlanBranchEvidence({
			slug: PLAN_SLUG,
			branch: TARGET_BRANCH,
			branchCreation: "graphite",
			startPoint: START_POINT,
			namespace: PLAN_BRANCH_NAMESPACE,
			key: PLAN_KEY,
			refName: `refs/brmem/ns/${PLAN_BRANCH_NAMESPACE}/brmem-plans---wire-create-plan-branch-command:${PLAN_KEY}`,
			commit: "abc123",
			sourceFile: "/tmp/plan.md",
			summary: "Plan the branch-creating flow.",
		});

		expect(text).toContain("Created planned branch and attached plan.");
		expect(text).toContain(`Branch: ${TARGET_BRANCH}`);
		expect(text).toContain("Branch creation: graphite");
		expect(text).toContain(`Start point: ${START_POINT}`);
		expect(text).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(text).toContain(`Key: ${PLAN_KEY}`);
		expect(text).toContain("Ref: refs/brmem/ns/brmem-plans/brmem-plans---wire-create-plan-branch-command");
		expect(text).toContain("Commit: abc123");
		expect(text).toContain("Source file: /tmp/plan.md");
		expect(text).toContain("Summary: Plan the branch-creating flow.");
	});
});

describe("formatSourceBranchPlanFileEvidence", () => {
	test("reports all local plan store evidence", () => {
		const text = formatSourceBranchPlanFileEvidence({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey: "gh--owner--repo",
			repoIdentitySource: "origin-url",
			sourceBranch: "brmem-plans/add-widget",
			branchKey: "brmem-plans---add-widget",
			filePath: "/archive/gh--owner--repo/brmem-plans---add-widget/branch-scoped-plan-extension.md",
			summary: "Plan the archived saved plan file.",
		});

		expect(text).toContain("Saved plan file in local plan store.");
		expect(text).toContain("Path: /archive/gh--owner--repo/brmem-plans---add-widget/branch-scoped-plan-extension.md");
		expect(text).toContain("Repo key: gh--owner--repo");
		expect(text).toContain(`Repo root: ${ROOT}`);
		expect(text).toContain("Repo identity source: origin-url");
		expect(text).toContain("Source branch: brmem-plans/add-widget");
		expect(text).toContain("Branch path segment: brmem-plans---add-widget");
		expect(text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(text).toContain("Summary: Plan the archived saved plan file.");
	});
});

describe("isPathInside", () => {
	test("handles sibling prefixes correctly", () => {
		expect(isPathInside("/repo", "/repo/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo/nested/file.md")).toBe(true);
		expect(isPathInside("/repo", "/repo-other/file.md")).toBe(false);
		expect(isPathInside("/repo", "/repo2/file.md")).toBe(false);
	});
});

describe("plan workflow commands", () => {
	test("registers only the planned-branch command surface and write-plan tool", () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual(["create-planned-branch", "impl-planned-branch", "write-plan"]);
		expect(pi.commands.has("create-plan-file")).toBe(false);
		expect(pi.commands.has("create-brmem-plan-branch")).toBe(false);
		expect(pi.commands.has("create-latest-plan-branch")).toBe(false);
		expect(pi.tools.has("write_source_branch_plan_file")).toBe(true);
		expect(pi.tools.has("create_brmem_plan_branch_from_file")).toBe(false);
		expect(pi.tools.has("persist_brmem_plan")).toBe(false);
	});

	test("write-plan waits for idle before dispatching the generated prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("write-plan");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  add a tiny docs note plan for testing  ", context.ctx);

		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("/write-plan request");
		expect(pi.sentUserMessages[0]).toContain("add a tiny docs note plan for testing");
		expect(pi.sentUserMessages[0]).toContain("write_source_branch_plan_file");
		expect(pi.sentUserMessages[0]).toContain("~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md");
		expect(pi.sentUserMessages[0]).not.toContain("create_brmem_plan_branch_from_file");
		expect(pi.sentUserMessages[0]).not.toContain("branchCreation");
		expect(context.notifications).toEqual([{ message: "Starting /write-plan planning turn…", level: "info" }]);
	});

	test("write-plan with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("write-plan");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("impl-planned-branch waits for idle and dispatches the brmem-plan-impl skill", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("impl-planned-branch");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  foo  ", context.ctx);

		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.sentUserMessages).toEqual(["/skill:brmem-plan-impl foo"]);
		expect(context.notifications).toEqual([{ message: "Starting implementation from the attached plan…", level: "info" }]);
	});

	test("create-planned-branch help displays usage without mutation", async () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-planned-branch");
		const context = createContext();

		await command?.handler("--help", context.ctx);

		expect(context.waits()).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(CREATE_PLANNED_BRANCH_USAGE);
	});

	test("create-planned-branch dry-run resolves latest local plan store without mutating", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		const filePath = await writeArchivePlanFile(directoryPath, `${PLAN_KEY}`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		createBrmemPlanBranchExtension(pi, { planStoreRoot: archiveRoot });
		const command = pi.commands.get("create-planned-branch");
		const context = createContext();

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["config", "--get", "remote.origin.url"] },
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch was created and no plan was attached.");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(context.statuses.at(-1)).toEqual({ key: "create-planned-branch", value: undefined });
	});

	test("create-planned-branch dry-run prefers session-created plan over newer disk mtime", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const newerDiskSlug = "harden-cp-newbr-validation";
		const sessionPath = await writeArchivePlanFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		await writeArchivePlanFile(directoryPath, `${newerDiskSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		createBrmemPlanBranchExtension(pi, { planStoreRoot: archiveRoot });
		const command = pi.commands.get("create-planned-branch");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Saved plan from current session:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${sessionPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${sessionSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`${newerDiskSlug}.md`);
	});

	test("create-planned-branch explicit path wins over session evidence", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const explicitSlug = "harden-cp-newbr-validation";
		const sessionPath = await writeArchivePlanFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const explicitPath = await writeArchivePlanFile(directoryPath, `${explicitSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi, { planStoreRoot: archiveRoot });
		const command = pi.commands.get("create-planned-branch");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }))],
		});

		await command?.handler(`--dry-run ${explicitPath}`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${explicitPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${explicitSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain("Saved plan from current session:");
	});

	test("create-planned-branch ignores missing session file and falls back to disk latest", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		const missingSlug = "submit-dirty-worktree-checkpoint";
		const diskSlug = "harden-cp-newbr-validation";
		const missingPath = join(directoryPath, `${missingSlug}.md`);
		const diskPath = await writeArchivePlanFile(directoryPath, `${diskSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
		]);
		createBrmemPlanBranchExtension(pi, { planStoreRoot: archiveRoot });
		const command = pi.commands.get("create-planned-branch");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: missingSlug, filePath: missingPath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Latest saved plan from local plan store:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${diskPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${diskSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain("Saved plan from current session:");
	});

	test("create-planned-branch ignores wrong repo or branch session evidence", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const diskSlug = "harden-cp-newbr-validation";
		const sessionPath = await writeArchivePlanFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const diskPath = await writeArchivePlanFile(directoryPath, `${diskSlug}.md`, 1_800_000_000_000);
		const wrongBranchEvidence = {
			...sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }),
			sourceBranch: "other-branch",
			branchKey: "other-branch",
		};
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
		]);
		createBrmemPlanBranchExtension(pi, { planStoreRoot: archiveRoot });
		const command = pi.commands.get("create-planned-branch");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(wrongBranchEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Latest saved plan from local plan store:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${diskPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${diskSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain("Saved plan from current session:");
	});

	test("create-planned-branch ignores stale cancellation output while using tool result evidence", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const directoryPath = sourceArchiveDirectory(archiveRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const staleSlug = "harden-cp-newbr-validation";
		const sessionPath = await writeArchivePlanFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const stalePath = await writeArchivePlanFile(directoryPath, `${staleSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		createBrmemPlanBranchExtension(pi, { planStoreRoot: archiveRoot });
		const command = pi.commands.get("create-planned-branch");
		const context = createContext([], {
			sessionEntries: [
				sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch })),
				latestPlanBranchCustomMessageEntry(
					`Cancelled: no branch was created and no plan was attached.\n\nLatest saved plan from local plan store:\nPath: ${stalePath}\nSlug: ${staleSlug}`,
				),
			],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Saved plan from current session:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${sessionPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${sessionSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Path: ${stalePath}`);
	});

	test("create-planned-branch creates without interactive confirmation", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi(successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }), events);
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-planned-branch");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
	});

	test("create-planned-branch fails on target branch collision without prompting", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([
			gitRootStep(),
			refFormatStep(PLAN_SLUG),
			headStep(),
			localBranchCheckStep(PLAN_SLUG, { code: 0, stdout: `${START_POINT}\n` }),
		], events);
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-planned-branch");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(pi.execCalls.map((call) => call.args)).toEqual([
			["rev-parse", "--show-toplevel"],
			["check-ref-format", "--branch", PLAN_SLUG],
			["rev-parse", "HEAD"],
			["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`],
		]);
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["branch", PLAN_SLUG, "HEAD"]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Target branch already exists; refusing to overwrite.");
	});

	test("create-planned-branch --yes creates a plain-git plan branch from an explicit file", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi(successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }));
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-planned-branch");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["check-ref-format", "--branch", PLAN_SLUG] },
			{ command: "git", args: ["rev-parse", "HEAD"] },
			{ command: "git", args: ["rev-parse", "--verify", `refs/heads/${PLAN_SLUG}`] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_SLUG, "--format", "json"] },
			{ command: "git", args: ["branch", PLAN_SLUG, "HEAD"] },
			{
				command: "brmem",
				args: ["put", PLAN_KEY, "--namespace", PLAN_BRANCH_NAMESPACE, "--branch", PLAN_SLUG, "--file", filePath, "--format", "json"],
			},
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("create-planned-branch --graphite uses Graphite branch creation", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi(graphiteSuccessScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }));
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-planned-branch");
		const context = createContext();

		await command?.handler(`${filePath} --yes --graphite`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "git",
			args: ["branch", "--show-current"],
		});
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "git",
			args: ["branch", PLAN_SLUG, "HEAD"],
		});
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "gt",
			args: ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"],
		});
		expect(pi.execCalls.map((call) => call.args)).not.toContainEqual(["status", "--porcelain=v1", "--untracked-files=normal"]);
		expect(pi.execCalls.map((call) => call.args[0])).not.toContain("create");
		expect(pi.execCalls.map((call) => call.args[0])).not.toContain("checkout");
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("create-planned-branch extension options default to Graphite without a branch prefix", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi(graphiteSuccessScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }));
		createBrmemPlanBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
		});
		const command = pi.commands.get("create-planned-branch");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toContain("gt");
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({
			command: "gt",
			args: ["track", PLAN_SLUG, "--parent", SOURCE_BRANCH, "--no-interactive"],
		});
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("create-planned-branch --plain-git override keeps the slug branch under the Graphite default", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi(successScript({ branch: PLAN_SLUG, key: PLAN_KEY, filePath }));
		createBrmemPlanBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
		});
		const command = pi.commands.get("create-planned-branch");

		await command?.handler(`${filePath} --yes --plain-git`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).not.toContain("gt");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("create-planned-branch plannedBranchPrefix remains opt-in", async () => {
		const filePath = await makeNamedPlanFile();
		const prefixedBranch = `brmem-plans/${PLAN_SLUG}`;
		const pi = new FakePi(graphiteSuccessScript({ branch: prefixedBranch, key: PLAN_KEY, filePath }));
		createBrmemPlanBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
			plannedBranchPrefix: "brmem-plans/",
		});
		const command = pi.commands.get("create-planned-branch");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toContain("gt");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${prefixedBranch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("create-planned-branch passes explicit target branch while keeping key from slug", async () => {
		const filePath = await makeNamedPlanFile();
		const branch = "brmem-plans/custom-target";
		const pi = new FakePi(successScript({ branch, key: PLAN_KEY, filePath }));
		createBrmemPlanBranchExtension(pi, { plannedBranchPrefix: "brmem-plans/" });
		const command = pi.commands.get("create-planned-branch");

		await command?.handler(`${filePath} --yes --branch ${branch}`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).toContainEqual(["branch", branch, "HEAD"]);
		expect(pi.execCalls.map((call) => call.args)).toContainEqual([
			"put",
			PLAN_KEY,
			"--namespace",
			PLAN_BRANCH_NAMESPACE,
			"--branch",
			branch,
			"--file",
			filePath,
			"--format",
			"json",
		]);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${branch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
	});

	test("create-planned-branch rejects relative explicit paths before primitive mutation", async () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-planned-branch");

		await command?.handler("relative-source-plan.md --yes", createContext().ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Plan file path must be absolute");
	});

	test("create-planned-branch surfaces primitive failures without retrying", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([gitRootStep(), refFormatStep(PLAN_SLUG, { code: 1, stderr: "invalid ref" })]);
		createBrmemPlanBranchExtension(pi);
		const command = pi.commands.get("create-planned-branch");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.args)).toEqual([
			["rev-parse", "--show-toplevel"],
			["check-ref-format", "--branch", PLAN_SLUG],
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Failed to create planned branch and attach the plan.");
		expect(pi.sentMessages[0]?.content).toContain("git check-ref-format failed");
	});
});

describe("write_source_branch_plan_file tool", () => {
	test("describes the local plan store contract and strict parameters", () => {
		const pi = new FakePi();
		createBrmemPlanBranchExtension(pi);
		const tool = registeredTool(pi, "write_source_branch_plan_file");
		const parameters = tool.parameters as {
			properties?: Record<string, unknown>;
			required?: string[];
			additionalProperties?: boolean;
		};

		expect(tool.description).toContain("~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md");
		expect(tool.description).toContain("refuses to overwrite");
		expect(tool.description).toContain("does not create branches or write Branch Memory");
		expect(tool.promptSnippet).toContain("local plan store");
		expect(tool.promptGuidelines?.join("\n")).toContain("/write-plan");
		expect(tool.promptGuidelines?.join("\n")).not.toContain("create-brmem-plan-branch");
		expect(parameters.required).toEqual(["slug", "content"]);
		expect(parameters.additionalProperties).toBe(false);
		expect(Object.keys(parameters.properties ?? {})).toEqual(["slug", "content", "summary"]);
	});
});

describe("writeSourceBranchPlanFile", () => {
	test("writes a source branch saved plan file with origin identity evidence", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "brmem-plans/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ stdout: `${origin}\n` })]);

		const evidence = await writeSourceBranchPlanFile(
			pi,
			{
				slug: PLAN_SLUG,
				content: "# Test Plan\n\nDo the work.\n",
				summary: "Plan the local plan store file.",
			},
			{ cwd: ROOT, archiveRoot },
		);

		const repoKey = buildRepoArchiveKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const expectedPath = join(archiveRoot, repoKey, branchKey, PLAN_KEY);

		pi.assertDone();
		expect(evidence).toEqual({
			slug: PLAN_SLUG,
			repoRoot: ROOT,
			repoKey,
			repoIdentitySource: "origin-url",
			sourceBranch,
			branchKey,
			filePath: expectedPath,
			summary: "Plan the local plan store file.",
		});
		expect(await readFile(expectedPath, "utf8")).toBe("# Test Plan\n\nDo the work.\n");
	});

	test("falls back to real repo root identity when origin is absent", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "main";
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ code: 1, stderr: "no origin" })]);

		const evidence = await writeSourceBranchPlanFile(
			pi,
			{ slug: PLAN_SLUG, content: "# Test Plan\n" },
			{ cwd: ROOT, archiveRoot },
		);

		pi.assertDone();
		expect(evidence.repoIdentitySource).toBe("repo-root");
		expect(evidence.repoKey).toBe(buildRepoArchiveKey(ROOT, ROOT));
		expect(await readFile(evidence.filePath, "utf8")).toBe("# Test Plan\n");
	});

	test("refuses to overwrite an existing local plan store file", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const sourceBranch = "brmem-plans/add-widget";
		const origin = "git@github.com:owner/repo.git";
		const repoKey = buildRepoArchiveKey(ROOT, normalizeRepoOriginUrl(origin));
		const branchKey = encodeBranchForPlanPath(sourceBranch);
		const filePath = join(archiveRoot, repoKey, branchKey, PLAN_KEY);
		await mkdir(dirname(filePath), { recursive: true });
		await writeFile(filePath, "# Existing Plan\n", "utf8");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep({ stdout: `${origin}\n` })]);

		await expect(
			writeSourceBranchPlanFile(pi, { slug: PLAN_SLUG, content: "# New Plan\n" }, { cwd: ROOT, archiveRoot }),
		).rejects.toThrow("refusing to overwrite");

		pi.assertDone();
		expect(await readFile(filePath, "utf8")).toBe("# Existing Plan\n");
	});

	test("rejects invalid slug before git commands or filesystem writes", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const pi = new FakePi();

		await expect(
			writeSourceBranchPlanFile(pi, { slug: "Bad Slug", content: "# Test Plan\n" }, { cwd: ROOT, archiveRoot }),
		).rejects.toThrow("Invalid saved plan slug");
		expect(pi.execCalls).toEqual([]);
	});

	test("rejects detached HEAD with a clear named-branch message", async () => {
		const archiveRoot = await makeTempDir("source-plan-archive-");
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep("", { stdout: "\n" })]);

		await expect(
			writeSourceBranchPlanFile(pi, { slug: PLAN_SLUG, content: "# Test Plan\n" }, { cwd: ROOT, archiveRoot }),
		).rejects.toThrow("check out a named branch");

		pi.assertDone();
	});
});
