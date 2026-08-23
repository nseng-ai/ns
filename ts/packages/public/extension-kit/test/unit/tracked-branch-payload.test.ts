import { mkdtempSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertFocusedRawTextModelArgs } from "@nseng-ai/extension-kit/model-slug/testing";
import {
	buildTrackedBranchImplPrompt,
	loadTrackedBranchPayload,
	createTrackedBranchForPrompt,
	createTrackedBranchFromResolvedParent,
	prepareLocalGraphiteTrunk,
	resolveTrackedBranchPayloadOptions,
	storeTrackedBranchPayload,
	TRACKED_BRANCH_PAYLOAD_KEY,
	TRACKED_BRANCH_PAYLOAD_NAMESPACE,
} from "@nseng-ai/extension-kit/tracked-branch-payload";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = mkdtempSync(join(tmpdir(), "tracked-branch-payload-root-"));
const PROJECT_CONFIG: ProjectConfigGateway = {
	readTextFile: () => ({
		type: "found",
		text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
	}),
	pathExists: () => ({ type: "missing" }),
};

interface Step {
	command: string;
	args?: string[];
	result: ExecResult;
}

class FakeCommands implements CommandExecApi {
	readonly calls: Array<{ command: string; args: string[]; options?: ExecOptions }> = [];
	private readonly steps: readonly Step[];
	private next = 0;

	constructor(steps: readonly Step[]) {
		this.steps = steps;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], ...(options === undefined ? {} : { options }) });
		const expected = this.steps[this.next++];
		if (expected === undefined) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		expect(command).toBe(expected.command);
		if (expected.args !== undefined) expect(args).toEqual(expected.args);
		return expected.result;
	}

	assertDone(): void {
		expect(this.next).toBe(this.steps.length);
	}
}

const directories: string[] = [];

function trackedBranchContext(pi: CommandExecApi, git: InMemoryGitGateway) {
	return { pi, git, projectConfig: PROJECT_CONFIG };
}

function expectFocusedSlugCall(
	commands: FakeCommands,
	content: string,
	options: { isTruncated?: boolean } = {},
): void {
	const calls = commands.calls.filter((call) => call.command === "pi");
	expect(calls).toHaveLength(1);
	const call = calls[0];
	expect(call?.options?.cwd).toBe(REPO_ROOT);
	const modelPrompt = assertFocusedRawTextModelArgs(call?.args ?? [], {
		provider: "openai-codex",
		modelId: "gpt-5.6-luna",
		thinking: "minimal",
	});
	expect(modelPrompt).toContain("Generate a concise git branch slug");
	expect(modelPrompt).toContain("user task prompt that will run in a new branch workspace");
	expect(modelPrompt).toContain("Content:");
	if (options.isTruncated === true) {
		expect(modelPrompt).toContain("...[truncated]");
		expect(modelPrompt).not.toContain(content.slice(12_000));
		return;
	}
	expect(modelPrompt).toContain(content);
	expect(modelPrompt.endsWith(content)).toBe(true);
}

afterEach(async () => {
	await Promise.all(
		directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

function exited(overrides: { stdout?: string; stderr?: string; code?: number } = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: null,
	};
}

function brmemEnvelope(data: Record<string, unknown>): string {
	return JSON.stringify({ exitCode: 0, data });
}

describe("tracked branch payload public API", () => {
	test("stores the exact neutral locator and cleans its staged payload", async () => {
		const stagingDir = await mkdtemp(join(tmpdir(), "tracked-payload-test-"));
		directories.push(stagingDir);
		const sourceFile = join(stagingDir, "123-feature-demo.md");
		const commands = new FakeCommands([
			{
				command: "brmem",
				args: [
					"check",
					"prompt.md",
					"--namespace",
					"ns-impl",
					"--branch",
					"feature-demo",
					"--format",
					"json",
				],
				result: exited({ stdout: brmemEnvelope({ present: false }) }),
			},
			{
				command: "brmem",
				args: [
					"put",
					"prompt.md",
					"--namespace",
					"ns-impl",
					"--branch",
					"feature-demo",
					"--file",
					sourceFile,
					"--format",
					"json",
				],
				result: exited({
					stdout: brmemEnvelope({
						namespace: "ns-impl",
						key: "prompt.md",
						branch: "feature-demo",
						refName: "refs/brmem/ns/ns-impl/feature-demo:prompt.md",
						commit: "abc123",
						sourceFile,
					}),
				}),
			},
		]);

		const result = await storeTrackedBranchPayload(commands, {
			cwd: REPO_ROOT,
			branchName: "feature-demo",
			content: "Implement the feature.\n",
			payloadOptions: resolveTrackedBranchPayloadOptions({ stagingDir, now: () => 123 }),
		});

		commands.assertDone();
		expect(result).toMatchObject({
			ok: true,
			value: { namespace: TRACKED_BRANCH_PAYLOAD_NAMESPACE, key: TRACKED_BRANCH_PAYLOAD_KEY },
		});
		await expect(readFile(sourceFile, "utf8")).rejects.toThrow();
	});

	test("refuses a Branch Memory collision before staging or mutation", async () => {
		const stagingDir = await mkdtemp(join(tmpdir(), "tracked-payload-collision-"));
		directories.push(stagingDir);
		const commands = new FakeCommands([
			{
				command: "brmem",
				args: [
					"check",
					"prompt.md",
					"--namespace",
					"ns-impl",
					"--branch",
					"feature-demo",
					"--format",
					"json",
				],
				result: exited({ stdout: brmemEnvelope({ present: true }) }),
			},
		]);

		const result = await storeTrackedBranchPayload(commands, {
			cwd: REPO_ROOT,
			branchName: "feature-demo",
			content: "Do not overwrite.\n",
			payloadOptions: resolveTrackedBranchPayloadOptions({ stagingDir, now: () => 123 }),
		});

		commands.assertDone();
		expect(result).toMatchObject({ ok: false, error: { code: "dispatch_prompt_collision" } });
		await expect(readFile(join(stagingDir, "123-feature-demo.md"), "utf8")).rejects.toThrow();
	});

	test("creates from the current branch and suffixes a colliding slug", async () => {
		const prompt = "Implement the feature";
		const commands = new FakeCommands([
			{
				command: "pi",
				result: exited({ stdout: "implement-feature\n" }),
			},
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/implement-feature"],
				result: exited(),
			},
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/implement-feature-2"],
				result: exited({ code: 1 }),
			},
			{
				command: "gt",
				args: ["track", "implement-feature-2", "--parent", "feature/source", "--no-interactive"],
				result: exited(),
			},
		]);

		const git = new InMemoryGitGateway({
			repoRoot: REPO_ROOT,
			currentBranch: "feature/source",
			headCommit: "abc123",
		});
		const result = await createTrackedBranchForPrompt(trackedBranchContext(commands, git), {
			cwd: REPO_ROOT,
			prompt,
		});

		commands.assertDone();
		expectFocusedSlugCall(commands, prompt);
		expect(git.currentBranchCalls).toEqual([{ cwd: REPO_ROOT }]);
		expect(git.headCommitCalls).toEqual([{ cwd: REPO_ROOT }]);
		expect(git.optionalRepoRootCalls).toEqual([{ cwd: REPO_ROOT }]);
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: REPO_ROOT, branch: "implement-feature-2", startPoint: "abc123" },
		]);
		expect(result).toEqual({
			branchName: "implement-feature-2",
			semanticSlug: "implement-feature",
			parentBranch: "feature/source",
			startPoint: "abc123",
		});
	});

	test("rejects detached HEAD before commands or branch creation", async () => {
		const commands = new FakeCommands([]);
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });

		const result = await createTrackedBranchForPrompt(trackedBranchContext(commands, git), {
			cwd: REPO_ROOT,
			prompt: "Implement the feature",
		});

		commands.assertDone();
		expect(result).toEqual({ error: "Could not resolve current branch: HEAD is detached." });
		expect(git.currentBranchCalls).toEqual([{ cwd: REPO_ROOT }]);
		expect(git.headCommitCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
	});

	test("reports current-branch failure before commands or branch creation", async () => {
		const commands = new FakeCommands([]);
		const git = new InMemoryGitGateway({
			currentBranch: {
				type: "failure",
				error: { code: "branch-failed", message: "current branch unavailable" },
			},
		});

		const result = await createTrackedBranchForPrompt(trackedBranchContext(commands, git), {
			cwd: REPO_ROOT,
			prompt: "Implement the feature",
		});

		commands.assertDone();
		expect(result).toEqual({
			error: "Could not resolve current branch: current branch unavailable",
		});
		expect(git.currentBranchCalls).toEqual([{ cwd: REPO_ROOT }]);
		expect(git.headCommitCalls).toEqual([]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
	});

	test("reports HEAD resolution failure before commands or branch creation", async () => {
		const commands = new FakeCommands([]);
		const git = new InMemoryGitGateway({
			currentBranch: "feature/source",
			headCommit: {
				type: "failure",
				error: { code: "head-failed", message: "HEAD unavailable" },
			},
		});

		const result = await createTrackedBranchForPrompt(trackedBranchContext(commands, git), {
			cwd: REPO_ROOT,
			prompt: "Implement the feature",
		});

		commands.assertDone();
		expect(result).toEqual({ error: "Could not resolve HEAD: HEAD unavailable" });
		expect(git.currentBranchCalls).toEqual([{ cwd: REPO_ROOT }]);
		expect(git.headCommitCalls).toEqual([{ cwd: REPO_ROOT }]);
		expect(git.createBranchAtStartPointCalls).toEqual([]);
	});

	test("returns the semantic slug for a non-colliding resolved trunk branch", async () => {
		const prompt = "Implement the trunk feature";
		const commands = new FakeCommands([
			{
				command: "pi",
				result: exited({ stdout: "implement-trunk-feature\n" }),
			},
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/implement-trunk-feature"],
				result: exited({ code: 1 }),
			},
			{
				command: "gt",
				args: ["track", "implement-trunk-feature", "--parent", "main", "--no-interactive"],
				result: exited(),
			},
		]);

		const git = new InMemoryGitGateway({ repoRoot: REPO_ROOT });
		const result = await createTrackedBranchFromResolvedParent(
			trackedBranchContext(commands, git),
			{
				cwd: REPO_ROOT,
				prompt,
				parentBranch: "main",
				startPoint: "def456",
			},
		);

		commands.assertDone();
		expectFocusedSlugCall(commands, prompt);
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: REPO_ROOT, branch: "implement-trunk-feature", startPoint: "def456" },
		]);
		expect(result).toEqual({
			branchName: "implement-trunk-feature",
			semanticSlug: "implement-trunk-feature",
			parentBranch: "main",
			startPoint: "def456",
		});
	});

	test("fails closed before branch mutation when model output cannot produce a slug", async () => {
		const prompt = "Implement fallback slug behavior";
		const commands = new FakeCommands([
			{
				command: "pi",
				result: exited({ stdout: "!!!\n" }),
			},
		]);
		const git = new InMemoryGitGateway({ repoRoot: REPO_ROOT });

		const result = await createTrackedBranchFromResolvedParent(
			trackedBranchContext(commands, git),
			{ cwd: REPO_ROOT, prompt, parentBranch: "main", startPoint: "abc123" },
		);

		commands.assertDone();
		expect(result).toMatchObject({
			error: expect.stringContaining("No deterministic fallback was attempted."),
		});
		expect(git.createBranchAtStartPointCalls).toEqual([]);
	});

	test("does not fall back when the model command fails", async () => {
		const prompt = "Implement fallback slug behavior";
		const commands = new FakeCommands([
			{
				command: "pi",
				result: exited({ code: 2, stderr: "model unavailable" }),
			},
		]);
		const git = new InMemoryGitGateway({ repoRoot: REPO_ROOT });

		const result = await createTrackedBranchFromResolvedParent(
			trackedBranchContext(commands, git),
			{ cwd: REPO_ROOT, prompt, parentBranch: "main", startPoint: "abc123" },
		);

		commands.assertDone();
		expect(result).toMatchObject({ error: expect.stringContaining("model unavailable") });
		expect(git.createBranchAtStartPointCalls).toEqual([]);
	});

	test("fails closed when both model output and content are unusable", async () => {
		const prompt = "!!!";
		const commands = new FakeCommands([
			{
				command: "pi",
				result: exited({ stdout: "???\n" }),
			},
		]);
		const git = new InMemoryGitGateway({ repoRoot: REPO_ROOT });

		const result = await createTrackedBranchFromResolvedParent(
			trackedBranchContext(commands, git),
			{ cwd: REPO_ROOT, prompt, parentBranch: "main", startPoint: "abc123" },
		);

		commands.assertDone();
		expect(result).toMatchObject({
			error: expect.stringContaining("No deterministic fallback was attempted."),
		});
		expect(git.createBranchAtStartPointCalls).toEqual([]);
	});

	test("fails closed after truncating task content instead of using omitted content as fallback", async () => {
		const prompt = `${"a".repeat(12_000)}Implement content beyond truncation`;
		const commands = new FakeCommands([
			{
				command: "pi",
				result: exited({ stdout: "!!!\n" }),
			},
		]);
		const git = new InMemoryGitGateway({ repoRoot: REPO_ROOT });

		const result = await createTrackedBranchFromResolvedParent(
			trackedBranchContext(commands, git),
			{ cwd: REPO_ROOT, prompt, parentBranch: "main", startPoint: "abc123" },
		);

		commands.assertDone();
		expectFocusedSlugCall(commands, prompt, { isTruncated: true });
		expect(result).toMatchObject({
			error: expect.stringContaining("No deterministic fallback was attempted."),
		});
		expect(git.createBranchAtStartPointCalls).toEqual([]);
	});

	test("resolves the configured local trunk SHA without upstream inspection or refresh", async () => {
		const commands = new FakeCommands([
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/heads/main"],
				result: exited({ stdout: "local123\n" }),
			},
		]);

		const result = await prepareLocalGraphiteTrunk(
			{ pi: commands, trunkBranch: "main" },
			{ cwd: REPO_ROOT },
		);

		commands.assertDone();
		expect(result).toEqual({
			type: "resolved-local-trunk",
			trunkBranch: "main",
			startRef: "refs/heads/main",
			startPoint: "local123",
		});
	});

	test("creates from the resolved commit and reports a later Graphite tracking failure", async () => {
		const prompt = "Implement the feature";
		const commands = new FakeCommands([
			{
				command: "pi",
				result: exited({ stdout: "implement-feature\n" }),
			},
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", "refs/heads/implement-feature"],
				result: exited({ code: 1 }),
			},
			{
				command: "gt",
				args: ["track", "implement-feature", "--parent", "feature/source", "--no-interactive"],
				result: exited({ code: 1, stderr: "not tracked" }),
			},
		]);

		const git = new InMemoryGitGateway({ repoRoot: REPO_ROOT });
		const result = await createTrackedBranchFromResolvedParent(
			trackedBranchContext(commands, git),
			{
				cwd: REPO_ROOT,
				prompt,
				parentBranch: "feature/source",
				startPoint: "abc123",
			},
		);

		commands.assertDone();
		expect(git.createBranchAtStartPointCalls).toEqual([
			{ cwd: REPO_ROOT, branch: "implement-feature", startPoint: "abc123" },
		]);
		expect(result).toMatchObject({
			error: expect.stringContaining("Created git branch implement-feature"),
		});
		expect("error" in result && result.error).toContain(
			"The destination session was not launched.",
		);
	});

	test("builds an implementation prompt without changing the existing agent instructions", () => {
		const rawPrompt = "Implement exactly this.\n\nKeep arbitrary `markdown` and $shell text.";
		const contextNote = "This branch starts from local trunk.";

		const prompt = buildTrackedBranchImplPrompt(rawPrompt, contextNote);

		expect(prompt).toBe(
			[
				"## Completion instructions",
				"After you finish the implementation:",
				"1. Create or update the branch commit using the repo's normal workflow.",
				"2. Then run `!ns flow submit`.",
				"",
				"## Launch context",
				contextNote,
				"",
				rawPrompt,
			].join("\n"),
		);
	});

	test("loads an exact large payload through machine output without shell quoting", async () => {
		const content = `${'large prompt λ `$shell` "quoted"\n'.repeat(8_000)}final newline\n`;
		const commands = new FakeCommands([
			{
				command: "brmem",
				args: [
					"get",
					"prompt.md",
					"--namespace",
					"ns-impl",
					"--branch",
					"feature/demo",
					"--format",
					"json",
				],
				result: exited({ stdout: JSON.stringify({ exitCode: 0, data: { content } }) }),
			},
		]);

		const result = await loadTrackedBranchPayload(commands, {
			cwd: REPO_ROOT,
			branchName: "feature/demo",
		});

		commands.assertDone();
		expect(result).toEqual({ ok: true, content });
	});

	test("returns a concise read failure without payload text", async () => {
		const commands = new FakeCommands([
			{
				command: "brmem",
				args: [
					"get",
					"prompt.md",
					"--namespace",
					"ns-impl",
					"--branch",
					"feature/demo",
					"--format",
					"json",
				],
				result: exited({ code: 1, stderr: "entry missing" }),
			},
		]);

		const result = await loadTrackedBranchPayload(commands, {
			cwd: REPO_ROOT,
			branchName: "feature/demo",
		});

		expect(result).toMatchObject({ ok: false, error: { code: "dispatch_prompt_read_failed" } });
		expect(JSON.stringify(result)).not.toContain("SECRET PROMPT BODY");
	});
});
