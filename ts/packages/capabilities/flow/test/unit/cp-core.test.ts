import { describe, expect, test } from "vitest";

import { createManualClock, createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@nseng-ai/capability-kit/text-generation";
import type { GraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/branch";
import { InMemoryGraphiteBranchGateway } from "@nseng-ai/capability-kit/graphite/testing";

import type { ActiveOperation } from "@nseng-ai/sdk";

import { runCpCore } from "../../src/ns/commands/cp.ts";
import { runCheckpointWorkflow, type CheckpointGateway } from "../../src/checkpoint/checkpoint.ts";
import type { PendingWorktreeError, PendingWorktreeSnapshot } from "../../src/ns/worktree.ts";

const validCheckpointMessage = `[cp] Update cp core

- Route checkpoint commits through injected gateways`;

class FakeCheckpointGateway implements CheckpointGateway {
	readonly commits: Array<{ cwd: string; message: string }> = [];
	private readonly loaded:
		| { ok: true; snapshot: PendingWorktreeSnapshot }
		| { ok: false; error: PendingWorktreeError };
	private readonly commitResult: { summary: string } | { error: string };

	constructor(options: {
		loaded:
			| { ok: true; snapshot: PendingWorktreeSnapshot }
			| { ok: false; error: PendingWorktreeError };
		commitResult?: { summary: string } | { error: string };
	}) {
		this.loaded = options.loaded;
		this.commitResult = options.commitResult ?? { summary: "abc123 [cp] Update cp core" };
	}

	async loadPendingWorktreeSnapshot(): Promise<
		{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
	> {
		return this.loaded;
	}

	async createCommitWithPreparedMessage(params: {
		cwd: string;
		message: string;
	}): Promise<{ summary: string } | { error: string }> {
		this.commits.push(params);
		return this.commitResult;
	}
}

class FakeTextGenerator implements TextGenerator {
	readonly calls: TextGenerationRequest[] = [];
	private readonly results: TextGenerationResult[];

	constructor(results: TextGenerationResult[] = [{ ok: true, text: validCheckpointMessage }]) {
		this.results = [...results];
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		this.calls.push({ ...request });
		return this.results.shift() ?? { ok: false, error: "missing text generation result" };
	}
}

describe("flow cp core", () => {
	test("snapshot failure returns the formatted error input without text generation or commit", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({
			loaded: {
				ok: false,
				error: {
					kind: "not_git_repo",
					message: "not inside a git repository",
					result: {
						code: 128,
						stdout: "",
						stderr: "fatal: not a git repository",
						type: "exited",
						signal: null,
					},
				},
			},
		});

		const result = await runCpCore(defaultOptions({ checkpointGateway: gateway, textGenerator }));

		expect(result).toEqual({
			type: "snapshot-failed",
			error: {
				kind: "not_git_repo",
				message: "not inside a git repository",
				result: {
					code: 128,
					stdout: "",
					stderr: "fatal: not a git repository",
					type: "exited",
					signal: null,
				},
			},
		});
		expect(textGenerator.calls).toEqual([]);
		expect(gateway.commits).toEqual([]);
	});

	test("configured trunk branch refusal does not call text generation or commit", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({
			loaded: { ok: true, snapshot: dirtySnapshot({ branch: "release" }) },
		});
		const graphite = new InMemoryGraphiteBranchGateway({ trunk: "release" });

		const result = await runCpCore(
			defaultOptions({ checkpointGateway: gateway, graphite, textGenerator }),
		);

		expect(result).toEqual({ type: "trunk", branch: "release" });
		expect(textGenerator.calls).toEqual([]);
		expect(gateway.commits).toEqual([]);
	});

	test.each(["main", "master"])(
		"allows feature branch named %s when configured trunk differs",
		async (branch) => {
			const textGenerator = new FakeTextGenerator();
			const gateway = new FakeCheckpointGateway({
				loaded: { ok: true, snapshot: dirtySnapshot({ branch }) },
			});
			const graphite = new InMemoryGraphiteBranchGateway({ trunk: "release" });

			const result = await runCpCore(
				defaultOptions({
					checkpointGateway: gateway,
					graphite,
					textGenerator,
					isDryRun: true,
				}),
			);

			expect(result).toMatchObject({ type: "dry-run", branch });
			expect(textGenerator.calls).toHaveLength(1);
			expect(gateway.commits).toEqual([]);
		},
	);

	test.each([
		{
			name: "command failure",
			trunk: {
				ok: false as const,
				reason: "command-failed" as const,
				error: { code: "graphite-trunk-failed", message: "gt trunk failed" },
			},
		},
		{
			name: "empty output",
			trunk: {
				ok: false as const,
				reason: "empty" as const,
				error: { code: "graphite-trunk-empty", message: "gt trunk returned no branch" },
			},
		},
	])("fails closed on Graphite trunk $name before clean/model/commit", async ({ trunk }) => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({
			loaded: { ok: true, snapshot: dirtySnapshot({ clean: true }) },
		});
		const graphite = new InMemoryGraphiteBranchGateway({ trunk });

		const result = await runCpCore(
			defaultOptions({ checkpointGateway: gateway, graphite, textGenerator }),
		);

		expect(result).toEqual({
			type: "trunk-resolution-failed",
			reason: trunk.reason,
			error: trunk.error,
		});
		expect(textGenerator.calls).toEqual([]);
		expect(gateway.commits).toEqual([]);
	});

	test("clean worktree refusal does not call text generation or commit", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({
			loaded: { ok: true, snapshot: dirtySnapshot({ clean: true }) },
		});

		const result = await runCpCore(defaultOptions({ checkpointGateway: gateway, textGenerator }));

		expect(result).toEqual({ type: "clean" });
		expect(textGenerator.calls).toEqual([]);
		expect(gateway.commits).toEqual([]);
	});

	test("dry-run generates a checkpoint message but does not commit", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({ loaded: { ok: true, snapshot: dirtySnapshot() } });

		const result = await runCpCore(
			defaultOptions({ checkpointGateway: gateway, textGenerator, isDryRun: true }),
		);

		expect(result).toEqual({
			type: "dry-run",
			branch: "feature/demo",
			message: validCheckpointMessage,
		});
		expect(textGenerator.calls).toHaveLength(1);
		expect(textGenerator.calls[0]).toMatchObject({ operation: "checkpoint-message" });
		expect(gateway.commits).toEqual([]);
	});

	test("reports elapsed generation progress through the workflow seam", async () => {
		const clock = createManualClock(0);
		const timers = createManualTimerScheduler();
		const gateway = new FakeCheckpointGateway({ loaded: { ok: true, snapshot: dirtySnapshot() } });
		let resolveModel!: (result: TextGenerationResult) => void;
		let markStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const pendingModel = new Promise<TextGenerationResult>((resolve) => {
			resolveModel = resolve;
		});
		const progress: string[] = [];
		const result = runCpCore({
			...defaultOptions({
				checkpointGateway: gateway,
				textGenerator: {
					generateText: async () => {
						markStarted();
						return await pendingModel;
					},
				},
			}),
			onPhase: (event) => {
				if (event.type === "phase-progress") progress.push(event.label);
			},
			time: { clock: clock.clock, timers: timers.timers },
		});

		await started;
		expect(progress).toContain("• Generating checkpoint message with model…");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("  … still generating checkpoint message (5s elapsed)");

		clock.advanceMs(5_000);
		timers.advanceMs(5_000);
		expect(progress).toContain("  … still generating checkpoint message (10s elapsed)");

		resolveModel({ ok: true, text: validCheckpointMessage });
		expect(await result).toMatchObject({ type: "committed" });
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("reports the selected model only while checkpoint message generation is pending", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({ loaded: { ok: true, snapshot: dirtySnapshot() } });
		const snapshots: ActiveOperation[][] = [];

		const result = await runCheckpointWorkflow({
			cwd: "/repo",
			env: { NS_CHECKPOINT_MODEL: "openai-codex/gpt-test" },
			gateway,
			graphite: new InMemoryGraphiteBranchGateway(),
			textGenerator,
			dryRun: true,
			onActiveOperations: (operations) => snapshots.push([...operations]),
		});

		expect(result.type).toBe("dry-run");
		expect(textGenerator.calls[0]?.modelRef).toBe("openai-codex/gpt-test");
		expect(snapshots).toEqual([
			[
				{
					kind: "model",
					operation: "generating checkpoint message",
					modelRef: "openai-codex/gpt-test",
				},
			],
			[],
		]);
	});

	test("clears model activity when checkpoint message generation fails", async () => {
		const textGenerator = new FakeTextGenerator([{ ok: false, error: "auth failed" }]);
		const gateway = new FakeCheckpointGateway({ loaded: { ok: true, snapshot: dirtySnapshot() } });
		const snapshots: ActiveOperation[][] = [];

		const result = await runCheckpointWorkflow({
			cwd: "/repo",
			env: { NS_CHECKPOINT_MODEL: "openai-codex/gpt-test" },
			gateway,
			graphite: new InMemoryGraphiteBranchGateway(),
			textGenerator,
			dryRun: false,
			onActiveOperations: (operations) => snapshots.push([...operations]),
		});

		expect(result).toEqual({ type: "message-failed", error: "auth failed" });
		expect(snapshots.at(-1)).toEqual([]);
	});

	test("message generation failure returns failure and does not commit", async () => {
		const textGenerator = new FakeTextGenerator([{ ok: false, error: "auth failed" }]);
		const gateway = new FakeCheckpointGateway({ loaded: { ok: true, snapshot: dirtySnapshot() } });

		const result = await runCpCore(defaultOptions({ checkpointGateway: gateway, textGenerator }));

		expect(result).toEqual({ type: "message-failed", error: "auth failed" });
		expect(textGenerator.calls).toHaveLength(1);
		expect(gateway.commits).toEqual([]);
	});

	test("commit failure returns failure", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({
			loaded: { ok: true, snapshot: dirtySnapshot() },
			commitResult: { error: "commit failed" },
		});

		const result = await runCpCore(defaultOptions({ checkpointGateway: gateway, textGenerator }));

		expect(result).toEqual({ type: "commit-failed", error: "commit failed" });
		expect(gateway.commits).toEqual([{ cwd: "/repo", message: validCheckpointMessage }]);
	});

	test("success returns commit summary plus generated message inputs", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({ loaded: { ok: true, snapshot: dirtySnapshot() } });

		const result = await runCpCore(defaultOptions({ checkpointGateway: gateway, textGenerator }));

		expect(result).toEqual({
			type: "committed",
			summary: "abc123 [cp] Update cp core",
			message: validCheckpointMessage,
		});
		expect(gateway.commits).toEqual([{ cwd: "/repo", message: validCheckpointMessage }]);
	});
});

function defaultOptions(overrides: {
	checkpointGateway: CheckpointGateway;
	textGenerator: TextGenerator;
	graphite?: Pick<GraphiteBranchGateway, "trunkBranch">;
	isDryRun?: boolean;
}) {
	return {
		cwd: "/repo",
		env: {},
		checkpointGateway: overrides.checkpointGateway,
		graphite: overrides.graphite ?? new InMemoryGraphiteBranchGateway(),
		textGenerator: overrides.textGenerator,
		isDryRun: overrides.isDryRun ?? false,
	};
}

function dirtySnapshot(overrides: Partial<PendingWorktreeSnapshot> = {}): PendingWorktreeSnapshot {
	return {
		root: "/repo",
		branch: "feature/demo",
		clean: false,
		status: " M src/app.ts\n",
		diff: "diff --git a/src/app.ts b/src/app.ts\n",
		...overrides,
	};
}
