import { describe, expect, test } from "bun:test";

import asdlStackImplExtension from "../index.ts";
import type { ExecResult } from "../src/command.ts";
import { formatSliceLedger } from "../src/ledger.ts";
import { parseStackPlanMarkdown } from "../src/plan.ts";

const TWO_BRANCH_PLAN = `---
schema: asdl.stack-plan.v1
objective: objective
planned_branches:
  - objective/one
  - objective/two
---

Branches:
- objective/one
- objective/two
`;

const ONE_BRANCH_PLAN = `---
schema: asdl.stack-plan.v1
objective: objective
planned_branches:
  - objective/one
---

Branches:
- objective/one
`;

const CURRENT_BRANCH = "objective/one";
const CURRENT_LEDGER_KEY = "objective/objective---one.md";
const CURRENT_HANDOFF_KEY = "handoffs/objective-objective---one.md";
const NEXT_BRANCH = "objective/two";
const NEXT_LEDGER_KEY = "objective/objective---two.md";
const NEXT_HANDOFF_KEY = "handoffs/objective-objective---two.md";

type ExpectedCommand = {
	command: string;
	args: string[] | ((args: string[]) => void);
	result: ExecResult;
};

type RegisteredTool = {
	name: string;
	execute(toolCallId: string, params: Record<string, unknown>): Promise<unknown>;
};

type RegisteredCommand = {
	handler(args: string, ctx: unknown): Promise<void>;
};

function result(stdout = "", code = 0, stderr = ""): ExecResult {
	return { stdout, stderr, code, killed: false };
}

function brmemListStdout(): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "stack-impls",
			branch: CURRENT_BRANCH,
			entries: [{ key: CURRENT_LEDGER_KEY }],
		},
	});
}

function brmemPutWithTempFile(argsPrefix: string[]): (args: string[]) => void {
	return (args) => {
		expect(args.slice(0, -1)).toEqual(argsPrefix);
		expect(args.at(-1)).toMatch(/\/asdl-stack-impl/);
	};
}

function fakePi(expectedCommands: ExpectedCommand[]) {
	const tools: RegisteredTool[] = [];
	const commands = new Map<string, RegisteredCommand>();
	const sentMessages: Array<{ content: string; options?: Record<string, unknown> }> = [];
	return {
		tools,
		commands,
		sentMessages,
		pi: {
			on() {},
			registerTool(tool: RegisteredTool) {
				tools.push(tool);
			},
			registerCommand(name: string, command: RegisteredCommand) {
				commands.set(name, command);
			},
			sendUserMessage(content: string, options?: Record<string, unknown>) {
				sentMessages.push({ content, options });
			},
			async exec(command: string, args: string[]) {
				const expected = expectedCommands.shift();
				if (!expected) {
					throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
				}
				expect(command).toBe(expected.command);
				if (typeof expected.args === "function") {
					expected.args(args);
				} else {
					expect(args).toEqual(expected.args);
				}
				return expected.result;
			},
		},
	};
}

function fakeCommandContext() {
	const notifications: Array<{ message: string; level: string }> = [];
	const newSessionPrompts: string[] = [];
	const newSessionOptions: unknown[] = [];
	return {
		notifications,
		newSessionPrompts,
		newSessionOptions,
		ctx: {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify(message: string, level: string) {
					notifications.push({ message, level });
				},
			},
			sessionManager: {
				getSessionFile() {
					return "/sessions/current.jsonl";
				},
			},
			async newSession(options: { withSession?: (ctx: { sendUserMessage(prompt: string): Promise<void> }) => Promise<void> }) {
				newSessionOptions.push(options);
				await options.withSession?.({
					async sendUserMessage(prompt: string) {
						newSessionPrompts.push(prompt);
					},
				});
				return { cancelled: false };
			},
		},
	};
}

function sliceDonePayload(): Record<string, unknown> {
	return {
		summary: "implemented slice",
		validation: "tests passed",
		handoff_markdown: "# Handoff\n\nDone.\n",
	};
}

async function queuePendingCloseout(tools: RegisteredTool[], id: string): Promise<void> {
	const doneTool = tools.find((tool) => tool.name === "stack_impl_slice_done");
	expect(doneTool).toBeDefined();
	await doneTool!.execute(id, sliceDonePayload());
}

describe("stack impl extension commands", () => {
	test("stack-impl-closeout stores the handoff and starts the next incomplete branch in a fresh session", async () => {
		const plan = parseStackPlanMarkdown(TWO_BRANCH_PLAN);
		const ledger = formatSliceLedger({
			planBranch: "plan-branch",
			planKey: "objective.md",
			planSha256: plan.sha256,
		});
		const expectedCommands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result(`${CURRENT_BRANCH}\n`) },
			{
				command: "brmem",
				args: ["list", "--namespace", "stack-impls", "--branch", CURRENT_BRANCH, "--format", "json"],
				result: result(brmemListStdout()),
			},
			{
				command: "brmem",
				args: ["get", CURRENT_LEDGER_KEY, "--namespace", "stack-impls", "--branch", CURRENT_BRANCH],
				result: result(ledger),
			},
			{
				command: "brmem",
				args: ["get", "objective.md", "--namespace", "stack-plans", "--branch", "plan-branch"],
				result: result(TWO_BRANCH_PLAN),
			},
			{
				command: "brmem",
				args: brmemPutWithTempFile([
					"put",
					CURRENT_HANDOFF_KEY,
					"--namespace",
					"session-artifacts",
					"--branch",
					CURRENT_BRANCH,
					"--file",
				]),
				result: result("Stored handoff\n"),
			},
			{
				command: "brmem",
				args: ["check", CURRENT_HANDOFF_KEY, "--namespace", "session-artifacts", "--branch", CURRENT_BRANCH],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: ["check", NEXT_HANDOFF_KEY, "--namespace", "session-artifacts", "--branch", NEXT_BRANCH],
				result: result("", 1),
			},
			{ command: "git", args: ["status", "--porcelain"], result: result("") },
			{
				command: "git",
				args: ["show-ref", "--verify", "--quiet", `refs/heads/${NEXT_BRANCH}`],
				result: result("", 1),
			},
			{ command: "git", args: ["checkout", "-b", NEXT_BRANCH, CURRENT_BRANCH], result: result("switched\n") },
			{ command: "gt", args: ["track", "-p", CURRENT_BRANCH], result: result("tracked\n") },
			{
				command: "brmem",
				args: brmemPutWithTempFile([
					"put",
					NEXT_LEDGER_KEY,
					"--namespace",
					"stack-impls",
					"--branch",
					NEXT_BRANCH,
					"--file",
				]),
				result: result("stored ledger\n"),
			},
		];
		const { pi, tools, commands, sentMessages } = fakePi(expectedCommands);
		asdlStackImplExtension(pi as never);
		await queuePendingCloseout(tools, "tool-call-1");
		const { ctx, notifications, newSessionPrompts, newSessionOptions } = fakeCommandContext();

		await commands.get("stack-impl-closeout")!.handler("tool-call-1", ctx);

		expect(sentMessages).toEqual([
			{ content: "/stack-impl-closeout tool-call-1", options: { deliverAs: "followUp" } },
		]);
		expect(notifications.map((notification) => notification.message)).toEqual([
			`Stored stack slice handoff for ${CURRENT_BRANCH}.\nEntry: session-artifacts/${CURRENT_HANDOFF_KEY}\nStored handoff`,
			`Started ${NEXT_BRANCH}.`,
		]);
		expect(newSessionOptions).toHaveLength(1);
		expect(newSessionPrompts).toHaveLength(1);
		expect(newSessionPrompts[0]).toContain(`Current planned branch: ${NEXT_BRANCH}`);
		expect(newSessionPrompts[0]).toContain(`Intended parent branch: ${CURRENT_BRANCH}`);
		expect(expectedCommands).toEqual([]);
	});

	test("stack-impl-closeout reports complete after the final slice without starting a session", async () => {
		const plan = parseStackPlanMarkdown(ONE_BRANCH_PLAN);
		const ledger = formatSliceLedger({
			planBranch: "plan-branch",
			planKey: "objective.md",
			planSha256: plan.sha256,
		});
		const expectedCommands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result(`${CURRENT_BRANCH}\n`) },
			{
				command: "brmem",
				args: ["list", "--namespace", "stack-impls", "--branch", CURRENT_BRANCH, "--format", "json"],
				result: result(brmemListStdout()),
			},
			{
				command: "brmem",
				args: ["get", CURRENT_LEDGER_KEY, "--namespace", "stack-impls", "--branch", CURRENT_BRANCH],
				result: result(ledger),
			},
			{
				command: "brmem",
				args: ["get", "objective.md", "--namespace", "stack-plans", "--branch", "plan-branch"],
				result: result(ONE_BRANCH_PLAN),
			},
			{
				command: "brmem",
				args: brmemPutWithTempFile([
					"put",
					CURRENT_HANDOFF_KEY,
					"--namespace",
					"session-artifacts",
					"--branch",
					CURRENT_BRANCH,
					"--file",
				]),
				result: result("Stored handoff\n"),
			},
			{
				command: "brmem",
				args: ["check", CURRENT_HANDOFF_KEY, "--namespace", "session-artifacts", "--branch", CURRENT_BRANCH],
				result: result("present\n"),
			},
		];
		const { pi, tools, commands } = fakePi(expectedCommands);
		asdlStackImplExtension(pi as never);
		await queuePendingCloseout(tools, "tool-call-2");
		const { ctx, notifications, newSessionPrompts, newSessionOptions } = fakeCommandContext();

		await commands.get("stack-impl-closeout")!.handler("tool-call-2", ctx);

		expect(notifications.map((notification) => notification.message)).toEqual([
			`Stored stack slice handoff for ${CURRENT_BRANCH}.\nEntry: session-artifacts/${CURRENT_HANDOFF_KEY}\nStored handoff`,
			"All planned branches for objective already have completion handoffs.",
		]);
		expect(newSessionOptions).toEqual([]);
		expect(newSessionPrompts).toEqual([]);
		expect(expectedCommands).toEqual([]);
	});
});
