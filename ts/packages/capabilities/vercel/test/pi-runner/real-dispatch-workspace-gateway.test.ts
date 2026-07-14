import { describe, expect, it } from "vitest";

import {
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_PROMPT_PATH,
	DISPATCH_RESULT_PATH,
	parseDispatchHarnessResult,
} from "../../src/dispatch/dispatch-run.ts";
import {
	createRealDispatchWorkspaceGateway,
	DISPATCH_RESULT_PARTIAL_PATH,
	type DispatchWorkspaceIo,
} from "../../src/pi-runner/real-dispatch-workspace-gateway.ts";

interface IoCall {
	readonly method: string;
	readonly args: readonly unknown[];
}

interface FakeIoBehavior {
	readonly files?: Readonly<Record<string, string>>;
	readonly existingPaths?: readonly string[];
	readonly readThrows?: boolean;
	readonly writeThrows?: boolean;
	readonly renameThrows?: boolean;
	readonly gitResults?: readonly { readonly exitCode: number; readonly stdout: string }[];
	readonly gitThrows?: boolean;
}

function createFakeIo(behavior: FakeIoBehavior = {}) {
	const calls: IoCall[] = [];
	const written = new Map<string, string>();
	let gitCallIndex = 0;
	const io: DispatchWorkspaceIo = {
		async readTextFile(path) {
			calls.push({ method: "readTextFile", args: [path] });
			if (behavior.readThrows === true) throw new Error("io failure");
			return behavior.files?.[path] ?? null;
		},
		async pathExists(path) {
			calls.push({ method: "pathExists", args: [path] });
			return behavior.existingPaths?.includes(path) ?? false;
		},
		async writeTextFile(path, content) {
			calls.push({ method: "writeTextFile", args: [path, content] });
			if (behavior.writeThrows === true) throw new Error("io failure");
			written.set(path, content);
		},
		async renameFile(from, to) {
			calls.push({ method: "renameFile", args: [from, to] });
			if (behavior.renameThrows === true) throw new Error("io failure");
			const content = written.get(from);
			if (content !== undefined) {
				written.delete(from);
				written.set(to, content);
			}
		},
		async makeDirectory(path) {
			calls.push({ method: "makeDirectory", args: [path] });
		},
		async runGitCommand(args) {
			calls.push({ method: "runGitCommand", args: [args] });
			if (behavior.gitThrows === true) throw new Error("git missing");
			const result = behavior.gitResults?.[gitCallIndex] ?? { exitCode: 0, stdout: "" };
			gitCallIndex += 1;
			return result;
		},
	};
	return { io, calls, written };
}

function gateway(behavior: FakeIoBehavior = {}) {
	const { io, calls, written } = createFakeIo(behavior);
	return {
		gateway: createRealDispatchWorkspaceGateway({ checkoutDirectory: "/checkout", io }),
		calls,
		written,
	};
}

describe("createRealDispatchWorkspaceGateway", () => {
	it("reads the dispatched prompt from the contract path", async () => {
		const { gateway: workspace } = gateway({
			files: { [DISPATCH_PROMPT_PATH]: "Do the thing." },
		});

		expect(await workspace.readDispatchedPrompt()).toEqual({ ok: true, prompt: "Do the thing." });
	});

	it("reports a missing prompt as null, not a failure", async () => {
		const { gateway: workspace } = gateway();

		expect(await workspace.readDispatchedPrompt()).toEqual({ ok: true, prompt: null });
	});

	it("maps a prompt read throw to a failure value", async () => {
		const { gateway: workspace } = gateway({ readThrows: true });

		expect(await workspace.readDispatchedPrompt()).toEqual({ ok: false });
	});

	it("checks the decision log at the contract path", async () => {
		const { gateway: workspace } = gateway({ existingPaths: [DISPATCH_DECISION_LOG_PATH] });

		expect(await workspace.decisionLogExists()).toEqual({ ok: true, hasDecisionLog: true });
	});

	it("writes the completion result atomically: scratch write, then rename onto the contract path", async () => {
		const { gateway: workspace, calls, written } = gateway();

		const result = await workspace.writeCompletionResult({
			outcome: "completed",
			summary: "Renamed 4 methods.",
		});

		expect(result).toEqual({ ok: true });
		const fileOps = calls.filter((call) => call.method !== "makeDirectory");
		expect(fileOps.map((call) => call.method)).toEqual(["writeTextFile", "renameFile"]);
		expect(fileOps[0]?.args[0]).toBe(DISPATCH_RESULT_PARTIAL_PATH);
		expect(fileOps[1]?.args).toEqual([DISPATCH_RESULT_PARTIAL_PATH, DISPATCH_RESULT_PATH]);

		// Contract round-trip: what the runner writes is exactly what the
		// workflow's parser accepts.
		const content = written.get(DISPATCH_RESULT_PATH);
		expect(content).toBeDefined();
		expect(parseDispatchHarnessResult(content ?? null)).toEqual({
			phase: "finished",
			outcome: "completed",
			summary: "Renamed 4 methods.",
		});
	});

	it("maps a rename failure to a failure value", async () => {
		const { gateway: workspace } = gateway({ renameThrows: true });

		expect(await workspace.writeCompletionResult({ outcome: "failed" })).toEqual({ ok: false });
	});

	it("writes the fallback decision log to the contract path", async () => {
		const { gateway: workspace, written } = gateway();

		const result = await workspace.writeFallbackDecisionLog("No decisions recorded.\n");

		expect(result).toEqual({ ok: true });
		expect(written.get(DISPATCH_DECISION_LOG_PATH)).toBe("No decisions recorded.\n");
	});

	it("reads dirtiness from git status --porcelain", async () => {
		const clean = gateway({ gitResults: [{ exitCode: 0, stdout: "\n" }] });
		expect(await clean.gateway.hasUncommittedChanges()).toEqual({
			ok: true,
			hasUncommittedChanges: false,
		});

		const dirty = gateway({ gitResults: [{ exitCode: 0, stdout: " M src/widget.ts\n" }] });
		expect(await dirty.gateway.hasUncommittedChanges()).toEqual({
			ok: true,
			hasUncommittedChanges: true,
		});
		expect(dirty.calls[0]).toEqual({
			method: "runGitCommand",
			args: [["status", "--porcelain"]],
		});
	});

	it("maps a git status failure to a failure value", async () => {
		const { gateway: workspace } = gateway({ gitResults: [{ exitCode: 128, stdout: "" }] });

		expect(await workspace.hasUncommittedChanges()).toEqual({ ok: false });
	});

	it("commits everything with add --all then commit --message", async () => {
		const { gateway: workspace, calls } = gateway();

		const result = await workspace.commitAllChanges("Commit dispatched work");

		expect(result).toEqual({ ok: true });
		expect(calls).toEqual([
			{ method: "runGitCommand", args: [["add", "--all"]] },
			{ method: "runGitCommand", args: [["commit", "--message", "Commit dispatched work"]] },
		]);
	});

	it("maps a commit failure to a failure value", async () => {
		const { gateway: workspace } = gateway({
			gitResults: [
				{ exitCode: 0, stdout: "" },
				{ exitCode: 1, stdout: "" },
			],
		});

		expect(await workspace.commitAllChanges("msg")).toEqual({ ok: false });
	});

	it("maps a git spawn throw to a failure value", async () => {
		const { gateway: workspace } = gateway({ gitThrows: true });

		expect(await workspace.hasUncommittedChanges()).toEqual({ ok: false });
		expect(await workspace.commitAllChanges("msg")).toEqual({ ok: false });
	});
});
