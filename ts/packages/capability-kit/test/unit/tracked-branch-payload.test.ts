import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildTrackedBranchImplPrompt,
	buildTrackedBranchPayloadLaunchCommand,
	buildTrackedBranchSlugPrompt,
	createTrackedBranchForPrompt,
	createTrackedBranchFromResolvedParent,
	prepareLocalGraphiteTrunk,
	resolveTrackedBranchPayloadOptions,
	storeTrackedBranchPayload,
	TRACKED_BRANCH_PAYLOAD_KEY,
	TRACKED_BRANCH_PAYLOAD_NAMESPACE,
} from "@nseng-ai/capability-kit/tracked-branch-payload";
import { buildRawTextModelArgs } from "@nseng-ai/capability-kit/model-slug";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { afterEach, describe, expect, test } from "vitest";

const REPO_ROOT = mkdtempSync(join(tmpdir(), "tracked-branch-payload-root-"));
writeFileSync(
	join(REPO_ROOT, "ns.toml"),
	'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
);

const TEST_MODEL_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};

interface Step {
	command: string;
	args: string[];
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
		expect({ command, args }).toEqual({ command: expected.command, args: expected.args });
		return expected.result;
	}

	assertDone(): void {
		expect(this.next).toBe(this.steps.length);
	}
}

const directories: string[] = [];

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

		const result = await storeTrackedBranchPayload(
			{ pi: commands },
			{
				cwd: REPO_ROOT,
				branchName: "feature-demo",
				content: "Implement the feature.\n",
				payloadOptions: resolveTrackedBranchPayloadOptions({ stagingDir, now: () => 123 }),
			},
		);

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

		const result = await storeTrackedBranchPayload(
			{ pi: commands },
			{
				cwd: REPO_ROOT,
				branchName: "feature-demo",
				content: "Do not overwrite.\n",
				payloadOptions: resolveTrackedBranchPayloadOptions({ stagingDir, now: () => 123 }),
			},
		);

		commands.assertDone();
		expect(result).toMatchObject({ ok: false, error: { code: "dispatch_prompt_collision" } });
		await expect(readFile(join(stagingDir, "123-feature-demo.md"), "utf8")).rejects.toThrow();
	});

	test("creates from the current branch and suffixes a colliding slug", async () => {
		const prompt = "Implement the feature";
		const commands = new FakeCommands([
			{
				command: "git",
				args: ["symbolic-ref", "--short", "HEAD"],
				result: exited({ stdout: "feature/source\n" }),
			},
			{
				command: "git",
				args: ["rev-parse", "HEAD"],
				result: exited({ stdout: "abc123\n" }),
			},
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				result: exited({ stdout: `${REPO_ROOT}\n` }),
			},
			{
				command: "pi",
				args: buildRawTextModelArgs(
					buildTrackedBranchSlugPrompt({ kind: "task", content: prompt }),
					TEST_MODEL_SELECTION,
				),
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

		const git = new InMemoryGitGateway();
		const result = await createTrackedBranchForPrompt(
			{ pi: commands, git },
			{ cwd: REPO_ROOT, prompt },
		);

		commands.assertDone();
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

	test("returns the semantic slug for a non-colliding resolved trunk branch", async () => {
		const prompt = "Implement the trunk feature";
		const commands = new FakeCommands([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				result: exited({ stdout: `${REPO_ROOT}\n` }),
			},
			{
				command: "pi",
				args: buildRawTextModelArgs(
					buildTrackedBranchSlugPrompt({ kind: "task", content: prompt }),
					TEST_MODEL_SELECTION,
				),
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

		const git = new InMemoryGitGateway();
		const result = await createTrackedBranchFromResolvedParent(
			{ pi: commands, git },
			{
				cwd: REPO_ROOT,
				prompt,
				parentBranch: "main",
				startPoint: "def456",
			},
		);

		commands.assertDone();
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

	test("resolves the configured local trunk SHA without upstream inspection or refresh", async () => {
		const commands = new FakeCommands([
			{
				command: "git",
				args: ["rev-parse", "--verify", "refs/heads/main"],
				result: exited({ stdout: "local123\n" }),
			},
		]);

		const result = await prepareLocalGraphiteTrunk(
			{ pi: commands, graphite: { trunkBranch: async () => ({ ok: true, branch: "main" }) } },
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
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				result: exited({ stdout: `${REPO_ROOT}\n` }),
			},
			{
				command: "pi",
				args: buildRawTextModelArgs(
					buildTrackedBranchSlugPrompt({ kind: "task", content: prompt }),
					TEST_MODEL_SELECTION,
				),
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

		const git = new InMemoryGitGateway();
		const result = await createTrackedBranchFromResolvedParent(
			{ pi: commands, git },
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

	test("launch command propagates model and thinking while reading the neutral locator", () => {
		const command = buildTrackedBranchPayloadLaunchCommand("feature/demo", {
			model: { provider: "anthropic", id: "claude-sonnet" },
			thinkingLevel: "high",
		});

		expect(command).toContain("brmem get prompt.md --namespace ns-impl --branch feature/demo");
		expect(command).toContain("pi --provider anthropic --model claude-sonnet --thinking high");
	});
});
