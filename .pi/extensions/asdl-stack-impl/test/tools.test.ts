import { describe, expect, test } from "bun:test";

import type { PendingCloseouts } from "../src/closeout.ts";
import { registerStackSliceTools } from "../src/tools.ts";

type RegisteredTool = {
	name: string;
	execute(toolCallId: string, params: Record<string, unknown>): Promise<{
		content: Array<{ type: string; text: string }>;
		details?: Record<string, unknown>;
	}>;
};

function fakePi() {
	const tools: RegisteredTool[] = [];
	const sentMessages: Array<{ content: string; options?: Record<string, unknown> }> = [];
	return {
		tools,
		sentMessages,
		pi: {
			registerTool(tool: RegisteredTool) {
				tools.push(tool);
			},
			sendUserMessage(content: string, options?: Record<string, unknown>) {
				sentMessages.push({ content, options });
			},
		},
	};
}

describe("stack impl tools", () => {
	test("stack_impl_slice_done queues closeout and stores pending payload", async () => {
		const pending: PendingCloseouts = new Map();
		const { pi, tools, sentMessages } = fakePi();
		registerStackSliceTools(pi as never, pending);

		const doneTool = tools.find((tool) => tool.name === "stack_impl_slice_done");
		expect(doneTool).toBeDefined();
		const response = await doneTool!.execute("tool-call-1", {
			summary: "done",
			validation: "tests passed",
			handoff_markdown: "# Handoff\n",
		});

		expect(pending.get("tool-call-1")?.handoff_markdown).toBe("# Handoff\n");
		expect(sentMessages).toEqual([
			{ content: "/stack-impl-closeout tool-call-1", options: { deliverAs: "followUp" } },
		]);
		expect(response.content[0]?.text).toContain("Queued /stack-impl-closeout");
	});

	test("stack_impl_slice_blocked reports blockage without writing a completion handoff", async () => {
		const pending: PendingCloseouts = new Map();
		const { pi, tools, sentMessages } = fakePi();
		registerStackSliceTools(pi as never, pending);

		const blockedTool = tools.find((tool) => tool.name === "stack_impl_slice_blocked");
		expect(blockedTool).toBeDefined();
		const response = await blockedTool!.execute("tool-call-2", {
			reason: "validation failed",
			attempted: "ran tests",
			next_steps: "fix failing test",
		});

		expect(pending.size).toBe(0);
		expect(sentMessages).toEqual([]);
		expect(response.content[0]?.text).toContain("Stack slice blocked: validation failed");
	});
});
