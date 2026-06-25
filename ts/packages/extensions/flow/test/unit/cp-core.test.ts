import { describe, expect, test } from "vitest";

import type {
	TextGenerationRequest,
	TextGenerationResult,
	TextGenerator,
} from "@sdl/sdl/text-generation";

import { runCpCore } from "../../src/commands/cp.ts";
import type { CheckpointGateway } from "../../src/shared/checkpoint.ts";
import type { PendingWorktreeError, PendingWorktreeSnapshot } from "../../src/shared/worktree.ts";

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
					result: { code: 128, stdout: "", stderr: "fatal: not a git repository", killed: false },
				},
			},
		});

		const result = await runCpCore(defaultOptions({ checkpointGateway: gateway, textGenerator }));

		expect(result).toEqual({
			type: "snapshot-failed",
			error: {
				kind: "not_git_repo",
				message: "not inside a git repository",
				result: { code: 128, stdout: "", stderr: "fatal: not a git repository", killed: false },
			},
		});
		expect(textGenerator.calls).toEqual([]);
		expect(gateway.commits).toEqual([]);
	});

	test("trunk branch refusal does not call text generation or commit", async () => {
		const textGenerator = new FakeTextGenerator();
		const gateway = new FakeCheckpointGateway({
			loaded: { ok: true, snapshot: dirtySnapshot({ branch: "main" }) },
		});

		const result = await runCpCore(defaultOptions({ checkpointGateway: gateway, textGenerator }));

		expect(result).toEqual({ type: "trunk", branch: "main" });
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
			defaultOptions({ checkpointGateway: gateway, textGenerator, dryRun: true }),
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
	dryRun?: boolean;
}) {
	return {
		cwd: "/repo",
		env: {},
		checkpointGateway: overrides.checkpointGateway,
		textGenerator: overrides.textGenerator,
		dryRun: overrides.dryRun ?? false,
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
