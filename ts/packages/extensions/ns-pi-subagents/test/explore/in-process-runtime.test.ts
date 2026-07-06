import { describe, expect, test } from "vitest";

import { READ_ONLY_SUBAGENT_TOOLS } from "@internal/pi-tools/runner-subagents";
import {
	createInProcessExplorerRuntime,
	type InProcessExplorerSession,
	type InProcessExplorerSessionCreateInput,
	type InProcessExplorerSessionEvent,
	type InProcessExplorerSessionFactory,
} from "../../src/explore/in-process-runtime.ts";

class FakeInProcessSession implements InProcessExplorerSession {
	readonly sessionFile = "/tmp/in-process.jsonl";
	private listener: ((event: InProcessExplorerSessionEvent) => void) | undefined;
	aborted = false;

	subscribe(listener: (event: InProcessExplorerSessionEvent) => void): () => void {
		this.listener = listener;
		return () => {
			this.listener = undefined;
		};
	}

	async prompt(): Promise<void> {
		this.listener?.({ type: "tool_start", toolName: "read" });
		this.listener?.({ type: "tool_end", toolName: "read", preview: "README.md" });
		this.listener?.({ type: "assistant", text: "Reading." });
		this.listener?.({ type: "done", finalText: "## Findings", stopReason: "stop" });
	}

	abort(): void {
		this.aborted = true;
	}

	dispose(): void {}
}

class FakeInProcessFactory implements InProcessExplorerSessionFactory {
	createInputs: InProcessExplorerSessionCreateInput[] = [];
	readonly session = new FakeInProcessSession();

	async create(input: InProcessExplorerSessionCreateInput): Promise<InProcessExplorerSession> {
		this.createInputs.push(input);
		return this.session;
	}
}

describe("in-process explorer runtime", () => {
	test("dispatches through explicit session factory and preserves read-only tools", async () => {
		const factory = new FakeInProcessFactory();
		const runtime = createInProcessExplorerRuntime({ sessionFactory: factory });
		const updates: string[] = [];

		const result = await runtime.dispatch({
			pi: {},
			ctx: { cwd: "/repo" },
			options: {
				prompt: "Inspect files.",
				returnMode: "final-text",
				tools: READ_ONLY_SUBAGENT_TOOLS,
				onProgress: (update) => updates.push(update.progress.state),
			},
		});

		expect(factory.createInputs[0]).toMatchObject({
			cwd: "/repo",
			tools: READ_ONLY_SUBAGENT_TOOLS,
		});
		expect(result).toMatchObject({
			status: "final-text",
			finalText: "## Findings",
			sessionFile: "/tmp/in-process.jsonl",
		});
		expect(updates).toContain("running");
	});
});
