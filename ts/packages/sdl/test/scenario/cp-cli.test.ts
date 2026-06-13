import { describe, expect, test } from "vitest";

import { listSdlCommands, runCli } from "@asdl/sdl/cli";
import type { CheckpointGateway } from "@asdl/sdl/checkpoint";
import type { PendingWorktreeError, PendingWorktreeSnapshot, WorktreeCommandResult } from "@asdl/sdl/pending-worktree";
import type { TextGenerationGateway, TextGenerationRequest, TextGenerationResult } from "@asdl/sdl/text-generation";

interface CheckpointState {
	snapshot?: PendingWorktreeSnapshot | { kind: PendingWorktreeError["kind"]; result?: WorktreeCommandResult };
	commit?: { summary: string } | { error: string };
}

interface TestState {
	checkpoint?: CheckpointState;
	textGeneration?: { results?: readonly TextGenerationResult[] };
}

class InMemoryCheckpointGateway implements CheckpointGateway {
	private readonly snapshot: PendingWorktreeSnapshot | { kind: PendingWorktreeError["kind"]; result?: WorktreeCommandResult };
	private readonly commit: { summary: string } | { error: string };
	readonly loadPendingWorktreeCalls: Array<{ cwd: string }> = [];
	readonly createCommitWithPreparedMessageCalls: Array<{ cwd: string; message: string }> = [];

	constructor(state: CheckpointState = {}) {
		this.snapshot = state.snapshot ?? defaultDirtySnapshot();
		this.commit = state.commit ?? { summary: "abc123 [cp] Update checkpoint tests" };
	}

	async loadPendingWorktreeSnapshot(params: { cwd: string }): Promise<{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }> {
		this.loadPendingWorktreeCalls.push({ cwd: params.cwd });
		if ("kind" in this.snapshot) {
			return { ok: false, error: pendingWorktreeError(this.snapshot.kind, this.snapshot.result) };
		}
		return { ok: true, snapshot: { ...this.snapshot } };
	}

	async createCommitWithPreparedMessage(params: { cwd: string; message: string }): Promise<{ summary: string } | { error: string }> {
		this.createCommitWithPreparedMessageCalls.push({ cwd: params.cwd, message: params.message });
		return this.commit;
	}
}

class InMemoryTextGenerationGateway implements TextGenerationGateway {
	private readonly results: TextGenerationResult[];
	readonly generateTextCalls: TextGenerationRequest[] = [];

	constructor(results: readonly TextGenerationResult[] = [{ ok: true, text: defaultCheckpointMessage() }]) {
		this.results = [...results];
	}

	async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
		this.generateTextCalls.push({ ...request });
		return this.results.shift() ?? { ok: false, error: "missing scripted text result" };
	}
}

function runWithFakes(args: readonly string[], state: TestState = {}, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const checkpoint = new InMemoryCheckpointGateway(state.checkpoint);
	const textGeneration = new InMemoryTextGenerationGateway(state.textGeneration?.results);
	return {
		checkpoint,
		textGeneration,
		stdout,
		stderr,
		exit: runCli(args, {
			context: { checkpoint, textGeneration },
			cwd: options.cwd ?? "/work",
			env: options.env ?? {},
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
		}),
	};
}

function defaultDirtySnapshot(): PendingWorktreeSnapshot {
	return {
		root: "/repo",
		branch: "feature/demo",
		status: " M src/app.ts\n",
		diff: "diff --git a/src/app.ts b/src/app.ts\n",
		clean: false,
	};
}

function defaultCheckpointMessage(): string {
	return `[cp] Update checkpoint tests

- Add CLI coverage`;
}

function commandResult(result: Partial<WorktreeCommandResult> = {}): WorktreeCommandResult {
	return {
		code: result.code ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "git failed",
		...(result.killed === undefined ? {} : { killed: result.killed }),
	};
}

function pendingWorktreeError(kind: PendingWorktreeError["kind"], result?: WorktreeCommandResult): PendingWorktreeError {
	const base = { result: result ?? commandResult() };
	switch (kind) {
		case "not_git_repo":
			return { ...base, kind, message: "Not inside a git repository." };
		case "detached_head":
			return { ...base, kind, message: "Detached HEAD." };
		case "status_failed":
			return { ...base, kind, message: "Could not read git status." };
		case "diff_failed":
			return { ...base, kind, message: "Could not read git diff." };
	}
}

function parseJsonOutput(run: { stdout: string[] }): Record<string, unknown> {
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected JSON object output.");
	}
	return value as Record<string, unknown>;
}

describe("sdl cp CLI help and parsing", () => {
	test("command metadata lists cp", () => {
		expect(listSdlCommands()).toEqual([{ name: "cp", description: "Create a checkpoint commit for the current diff." }]);
	});

	test("top-level help lists cp", async () => {
		const run = runWithFakes(["--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl");
		expect(help).toContain("Source Development Lifecycle tools.");
		expect(help).toContain("cp");
		expect(help).toContain("--runtime");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level -h prints help", async () => {
		const run = runWithFakes(["-h"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: sdl");
		expect(run.stdout.join("")).toContain("cp");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level --version prints package version", async () => {
		const run = runWithFakes(["--version"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("top-level runtime reports the TypeScript entrypoint", async () => {
		const run = runWithFakes(["--runtime"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("runtime: typescript\nentry_point: @asdl/sdl bin sdl -> ts/packages/sdl/src/cli.ts\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("command help documents checkpoint behavior", async () => {
		const run = runWithFakes(["cp", "--help"]);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("Usage: sdl cp");
		expect(help).toContain("model-authored");
		expect(help).toContain("SDL_CHECKPOINT_MODEL");
		expect(help).toContain("ASDL_DEV_CHECKPOINT_MODEL");
		expect(help).not.toContain("SDL_TEXT_BACKEND");
		expect(help).not.toContain("ASDL_DEV_TEXT_BACKEND");
		expect(help).toContain("--json-schema");
		expect(help).not.toContain("--format");
	});

	test("raw cp exposes json schema", async () => {
		const run = runWithFakes(["cp", "--json-schema"]);

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toHaveProperty("input_json_schema");
		expect(run.stderr.join("")).toBe("");
	});
});

describe("sdl cp CLI behavior", () => {
	test("drafts with the text-generation gateway and commits a valid model message", async () => {
		const message = `[cp] Update CLI checkpoint

- Add command table coverage`;
		const run = runWithFakes(["cp"], {
			checkpoint: { commit: { summary: "def456 [cp] Update CLI checkpoint" } },
			textGeneration: { results: [{ ok: true, text: message }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`def456 [cp] Update CLI checkpoint\n${message}\n`);
		expect(run.stderr.join("")).toBe("");
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([{ cwd: "/work" }]);
		expect(run.textGeneration.generateTextCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.4-mini",
				operation: "checkpoint-message",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## git status --porcelain\n\n M src/app.ts");
		expect(run.textGeneration.generateTextCalls[0]?.prompt).toContain("## git diff HEAD\n\ndiff --git a/src/app.ts b/src/app.ts");
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([{ cwd: "/work", message }]);
	});

	test("checkpoint model can be selected by SDL environment", async () => {
		const message = `[cp] Update env model

- Use configured model ref`;
		const run = runWithFakes(
			["cp"],
			{
				textGeneration: { results: [{ ok: true, text: message }] },
				checkpoint: { commit: { summary: "abc123 [cp] Update env model" } },
			},
			{ env: { SDL_CHECKPOINT_MODEL: "openai-codex/custom-mini", ASDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy" } },
		);

		expect(await run.exit).toBe(0);
		expect(run.textGeneration.generateTextCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("legacy checkpoint model environment is a fallback", async () => {
		const run = runWithFakes(
			["cp"],
			{ checkpoint: { commit: { summary: "abc123 [cp] Update checkpoint tests" } } },
			{ env: { ASDL_DEV_CHECKPOINT_MODEL: "openai-codex/legacy-mini" } },
		);

		expect(await run.exit).toBe(0);
		expect(run.textGeneration.generateTextCalls[0]?.modelRef).toBe("openai-codex/legacy-mini");
	});

	test("model generation error exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			textGeneration: { results: [{ ok: false, error: "auth failed" }] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("auth failed\n");
		expect(run.textGeneration.generateTextCalls).toHaveLength(1);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("invalid first model output triggers one repair request and commits the repaired message", async () => {
		const repaired = `[cp] Repair checkpoint message

- Keep only valid bullets`;
		const run = runWithFakes(["cp"], {
			textGeneration: {
				results: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: repaired },
				],
			},
			checkpoint: { commit: { summary: "abc123 [cp] Repair checkpoint message" } },
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.textGeneration.generateTextCalls).toHaveLength(2);
		expect(run.textGeneration.generateTextCalls[1]?.prompt).toContain("## previous invalid draft\n\nnot a commit message");
		expect(run.textGeneration.generateTextCalls[1]?.prompt).toContain("missing_cp_prefix");
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([{ cwd: "/work", message: repaired }]);
	});

	test("invalid first and repaired output exits 2 without committing", async () => {
		const run = runWithFakes(["cp"], {
			textGeneration: {
				results: [
					{ ok: true, text: "not a commit message" },
					{ ok: true, text: "still invalid" },
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Model produced an invalid checkpoint message after 2 attempts.");
		expect(run.stderr.join("")).toContain("missing_cp_prefix");
		expect(run.textGeneration.generateTextCalls).toHaveLength(2);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("clean worktree exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			checkpoint: {
				snapshot: {
					root: "/repo",
					branch: "feature/demo",
					status: "",
					diff: "",
					clean: true,
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("Working tree is clean; nothing to checkpoint.\n");
		expect(run.textGeneration.generateTextCalls).toEqual([]);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("trunk branch exits without model generation or committing", async () => {
		const run = runWithFakes(["cp"], {
			checkpoint: {
				snapshot: {
					root: "/repo",
					branch: "main",
					status: " M file.ts\n",
					diff: "diff --git a/file.ts b/file.ts\n",
					clean: false,
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toBe("Refusing to create checkpoint commit on trunk branch: main\n");
		expect(run.textGeneration.generateTextCalls).toEqual([]);
		expect(run.checkpoint.createCommitWithPreparedMessageCalls).toEqual([]);
	});

	test("cp rejects unsupported arguments", async () => {
		const run = runWithFakes(["cp", "--bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("error: unknown option");
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([]);
	});

	test("cp accepts a bare option terminator", async () => {
		const run = runWithFakes(["cp", "--"]);

		expect(await run.exit).toBe(0);
		expect(run.checkpoint.loadPendingWorktreeCalls).toEqual([{ cwd: "/work" }]);
	});
});
