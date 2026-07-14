import { describe, expect, it } from "vitest";

import type { DispatchHarnessCompletion } from "../../src/dispatch/completion-contract.ts";
import {
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_RESULT_PATH,
	DISPATCH_SUMMARY_MAX_CHARS,
} from "../../src/dispatch/dispatch-run.ts";
import {
	composeAgentPrompt,
	PI_RUNNER_FALLBACK_DECISION_LOG,
	PI_RUNNER_FINALIZE_COMMIT_MESSAGE,
	runDispatchedPiAgent,
	type DispatchWorkspaceGateway,
	type PiCodingAgentGateway,
	type PiCodingAgentRunResult,
} from "../../src/pi-runner/runner.ts";

interface FakeWorkspaceBehavior {
	readonly prompt?: string | null;
	readonly readPromptFails?: boolean;
	readonly hasDecisionLog?: boolean;
	readonly decisionLogCheckFails?: boolean;
	readonly fallbackWriteFails?: boolean;
	readonly resultWriteFails?: boolean;
	readonly hasUncommittedChanges?: boolean;
	readonly dirtyCheckFails?: boolean;
	readonly commitFails?: boolean;
}

class FakeDispatchWorkspaceGateway implements DispatchWorkspaceGateway {
	readonly #behavior: FakeWorkspaceBehavior;
	readonly #operations: string[];
	writtenCompletion: DispatchHarnessCompletion | null = null;
	writtenFallbackLog: string | null = null;
	commitMessages: string[] = [];

	constructor(behavior: FakeWorkspaceBehavior, operations: string[]) {
		this.#behavior = behavior;
		this.#operations = operations;
	}

	async readDispatchedPrompt() {
		this.#operations.push("readPrompt");
		if (this.#behavior.readPromptFails === true) return { ok: false } as const;
		return { ok: true, prompt: this.#behavior.prompt ?? null } as const;
	}

	async decisionLogExists() {
		this.#operations.push("decisionLogExists");
		if (this.#behavior.decisionLogCheckFails === true) return { ok: false } as const;
		return { ok: true, hasDecisionLog: this.#behavior.hasDecisionLog ?? false } as const;
	}

	async writeFallbackDecisionLog(content: string) {
		this.#operations.push("writeFallbackDecisionLog");
		if (this.#behavior.fallbackWriteFails === true) return { ok: false } as const;
		this.writtenFallbackLog = content;
		return { ok: true } as const;
	}

	async writeCompletionResult(completion: DispatchHarnessCompletion) {
		this.#operations.push("writeCompletionResult");
		if (this.#behavior.resultWriteFails === true) return { ok: false } as const;
		this.writtenCompletion = completion;
		return { ok: true } as const;
	}

	async hasUncommittedChanges() {
		this.#operations.push("hasUncommittedChanges");
		if (this.#behavior.dirtyCheckFails === true) return { ok: false } as const;
		return {
			ok: true,
			hasUncommittedChanges: this.#behavior.hasUncommittedChanges ?? false,
		} as const;
	}

	async commitAllChanges(message: string) {
		this.#operations.push("commitAll");
		if (this.#behavior.commitFails === true) return { ok: false } as const;
		this.commitMessages.push(message);
		return { ok: true } as const;
	}
}

class FakePiCodingAgentGateway implements PiCodingAgentGateway {
	readonly #result: PiCodingAgentRunResult;
	readonly #operations: string[];
	readonly #throws: boolean;
	prompts: string[] = [];

	constructor(
		operations: string[],
		result: PiCodingAgentRunResult = { ok: true, finalAssistantText: "Done." },
		throws = false,
	) {
		this.#operations = operations;
		this.#result = result;
		this.#throws = throws;
	}

	async runPromptToCompletion(options: { readonly prompt: string }) {
		this.#operations.push("agentRun");
		this.prompts.push(options.prompt);
		if (this.#throws) throw new Error("model stream exploded");
		return this.#result;
	}
}

function fixture(
	options: {
		readonly workspace?: FakeWorkspaceBehavior;
		readonly agentResult?: PiCodingAgentRunResult;
		readonly agentThrows?: boolean;
	} = {},
) {
	const operations: string[] = [];
	const workspace = new FakeDispatchWorkspaceGateway(
		{ prompt: "Rename the widget gateway methods.", ...options.workspace },
		operations,
	);
	const agent = new FakePiCodingAgentGateway(
		operations,
		options.agentResult ?? { ok: true, finalAssistantText: "Done." },
		options.agentThrows ?? false,
	);
	return { workspace, agent, operations };
}

describe("runDispatchedPiAgent", () => {
	it("runs the composed prompt to completion and writes the completed result last", async () => {
		const { workspace, agent, operations } = fixture({
			workspace: { hasDecisionLog: true },
		});

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report).toEqual({
			exitCode: 0,
			outcome: "completed",
			hasWrittenCompletionResult: true,
			detail: "Done.",
		});
		expect(workspace.writtenCompletion).toEqual({ outcome: "completed", summary: "Done." });
		// The result write is the completion signal: strictly after the agent
		// loop, the produced-work finalize, and the decision-log check.
		expect(operations).toEqual([
			"readPrompt",
			"agentRun",
			"hasUncommittedChanges",
			"decisionLogExists",
			"writeCompletionResult",
		]);
		expect(workspace.writtenFallbackLog).toBeNull();
	});

	it("hands the agent the dispatched prompt wrapped in the headless ground rules", async () => {
		const { workspace, agent } = fixture({ workspace: { hasDecisionLog: true } });

		await runDispatchedPiAgent({ workspace, agent });

		expect(agent.prompts).toHaveLength(1);
		const prompt = agent.prompts[0] ?? "";
		expect(prompt).toContain("Rename the widget gateway methods.");
		expect(prompt).toContain(DISPATCH_DECISION_LOG_PATH);
		expect(prompt).toContain(`Never write \`${DISPATCH_RESULT_PATH}\``);
		expect(prompt).toContain("Never push");
	});

	it("writes the fallback decision log when the agent recorded none", async () => {
		const { workspace, agent, operations } = fixture({
			workspace: { hasDecisionLog: false },
		});

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(0);
		expect(workspace.writtenFallbackLog).toBe(PI_RUNNER_FALLBACK_DECISION_LOG);
		// Still strictly before the completion signal.
		expect(operations.indexOf("writeFallbackDecisionLog")).toBeLessThan(
			operations.indexOf("writeCompletionResult"),
		);
	});

	it("writes the fallback decision log when the existence check itself fails", async () => {
		const { workspace, agent } = fixture({ workspace: { decisionLogCheckFails: true } });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(0);
		expect(workspace.writtenFallbackLog).toBe(PI_RUNNER_FALLBACK_DECISION_LOG);
	});

	it("still writes the result when the fallback decision log write fails", async () => {
		const { workspace, agent } = fixture({ workspace: { fallbackWriteFails: true } });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(0);
		expect(report.hasWrittenCompletionResult).toBe(true);
	});

	it("reports failure without invoking the agent when the prompt is missing", async () => {
		const { workspace, agent, operations } = fixture({ workspace: { prompt: null } });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(1);
		expect(report.outcome).toBe("failed");
		expect(workspace.writtenCompletion?.outcome).toBe("failed");
		expect(operations).not.toContain("agentRun");
	});

	it("reports failure when the prompt read fails", async () => {
		const { workspace, agent } = fixture({ workspace: { readPromptFails: true } });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(1);
		expect(workspace.writtenCompletion?.outcome).toBe("failed");
	});

	it("maps an agent failure to a failed result carrying its message, skipping the finalize commit", async () => {
		const { workspace, agent, operations } = fixture({
			agentResult: { ok: false, message: "No usable model was available." },
		});

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(1);
		expect(workspace.writtenCompletion).toEqual({
			outcome: "failed",
			summary: "No usable model was available.",
		});
		expect(operations).not.toContain("hasUncommittedChanges");
		expect(operations).not.toContain("commitAll");
	});

	it("turns an agent gateway throw into a failed result instead of dying resultless", async () => {
		const { workspace, agent } = fixture({ agentThrows: true });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(1);
		expect(workspace.writtenCompletion?.outcome).toBe("failed");
		expect(workspace.writtenCompletion?.summary).toContain("model stream exploded");
	});

	it("commits uncommitted produced work so the landing push carries it", async () => {
		const { workspace, agent } = fixture({ workspace: { hasUncommittedChanges: true } });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(0);
		expect(workspace.commitMessages).toEqual([PI_RUNNER_FINALIZE_COMMIT_MESSAGE]);
	});

	it("does not commit when the checkout is clean", async () => {
		const { workspace, agent, operations } = fixture({
			workspace: { hasUncommittedChanges: false },
		});

		await runDispatchedPiAgent({ workspace, agent });

		expect(operations).not.toContain("commitAll");
	});

	it("fails the run when uncommitted work cannot be committed", async () => {
		const { workspace, agent } = fixture({
			workspace: { hasUncommittedChanges: true, commitFails: true },
		});

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(1);
		expect(workspace.writtenCompletion?.outcome).toBe("failed");
	});

	it("fails the run when the dirty check fails", async () => {
		const { workspace, agent } = fixture({ workspace: { dirtyCheckFails: true } });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(1);
		expect(workspace.writtenCompletion?.outcome).toBe("failed");
	});

	it("exits 2 when the result cannot be written — the one path with no completion signal", async () => {
		const { workspace, agent } = fixture({ workspace: { resultWriteFails: true } });

		const report = await runDispatchedPiAgent({ workspace, agent });

		expect(report.exitCode).toBe(2);
		expect(report.hasWrittenCompletionResult).toBe(false);
		expect(workspace.writtenCompletion).toBeNull();
	});

	it("caps the summary to the workflow contract's bound", async () => {
		const { workspace, agent } = fixture({
			agentResult: { ok: true, finalAssistantText: "x".repeat(DISPATCH_SUMMARY_MAX_CHARS + 500) },
		});

		await runDispatchedPiAgent({ workspace, agent });

		expect(workspace.writtenCompletion?.summary).toHaveLength(DISPATCH_SUMMARY_MAX_CHARS);
	});

	it("omits the summary when the agent produced no final text", async () => {
		const { workspace, agent } = fixture({
			agentResult: { ok: true, finalAssistantText: null },
		});

		await runDispatchedPiAgent({ workspace, agent });

		expect(workspace.writtenCompletion).toEqual({ outcome: "completed" });
	});
});

describe("composeAgentPrompt", () => {
	it("keeps the dispatched work verbatim under its own heading", () => {
		const prompt = composeAgentPrompt("Line one.\n\nLine two.");

		expect(prompt).toContain("## Dispatched work\n\nLine one.\n\nLine two.");
	});
});
