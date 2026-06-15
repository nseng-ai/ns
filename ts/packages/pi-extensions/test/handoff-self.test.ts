import { describe, expect, test } from "vitest";

import handoffExtension, { buildHandoffSelfPrompt, formatHandoffSelfKickoffPrompt } from "../src/handoff.ts";
import {
	BRANCH,
	FakePi,
	branchStep,
	checkStep,
	createContext,
	getRegisteredTool,
	runCommand,
	skillCommandInfo,
	withTempSkill,
} from "./handoff-test-fakes.ts";

describe("handoff:self extension", () => {
	test("handoff:self command queues create prompt with context-clear pickup instructions", async () => {
		await withTempSkill(async (skillPath, repoDir) => {
			const result = await runCommand(
				"handoff:self",
				"finish the self handoff workflow",
				[branchStep()],
				{ cwd: repoDir },
				[skillCommandInfo(skillPath)],
			);

			result.pi.assertDone();
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.execCalls.map((call) => [call.command, call.args])).toEqual([["git", ["branch", "--show-current"]]]);
			expect(result.notifications).toEqual([{ message: "Starting handoff:self workflow with content-derived slug…", level: "info" }]);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			const prompt = result.pi.sentUserMessages[0] ?? "";
			expect(prompt).toContain(`<skill name="handoff-create" location="${skillPath}">`);
			expect(prompt).toContain("This is a /handoff:self request.");
			expect(prompt).toContain("finish the self handoff workflow");
			expect(prompt).toContain(`- Branch: ${BRANCH}`);
			expect(prompt).toContain("derive_handoff_slug_from_content");
			expect(prompt).toContain("After `brmem put` succeeds, call handoff_self_queue_pickup");
			expect(prompt).toContain("do not clear context or pick up the handoff");
			expect(prompt).toContain("/handoff:self-pickup <returned-slug>");
			expect(prompt).not.toContain(`/handoff:self-pickup --branch ${BRANCH} <returned-slug>`);
			expect(prompt).toContain(formatHandoffSelfKickoffPrompt(BRANCH, "<returned-slug>"));
			expect(prompt).not.toContain(`/handoff:pickup --branch ${BRANCH} <returned-slug>`);
		});
	});

	test("handoff self launch tool queues branchless self-pickup when saved branch is current", async () => {
		const pi = new FakePi([checkStep(BRANCH, "finish-widget.md", true), branchStep()]);
		handoffExtension(pi);
		const tool = getRegisteredTool(pi, "handoff_self_queue_pickup");
		const context = createContext();

		const result = await tool.execute("tool-call-1", { branch: BRANCH, slug: "finish-widget" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toContain("Queued handoff:self pickup.");
		expect(result.content[0]?.text).toContain("/handoff:self-pickup finish-widget");
		expect(result.details).toEqual({
			type: "queued",
			branch: BRANCH,
			slug: "finish-widget",
			command: "/handoff:self-pickup finish-widget",
		});
		expect(pi.sentUserMessageCalls).toEqual([
			{
				content: "/handoff:self-pickup finish-widget",
				options: { deliverAs: "followUp" },
			},
		]);
		expect(context.statuses).toEqual(["verifying saved handoff…", undefined]);
	});

	test("handoff self launch tool keeps explicit branch when saved branch is not current", async () => {
		const pi = new FakePi([checkStep("feature/other", "finish-widget.md", true), branchStep(BRANCH)]);
		handoffExtension(pi);
		const tool = getRegisteredTool(pi, "handoff_self_queue_pickup");
		const context = createContext();

		const result = await tool.execute("tool-call-1", { branch: "feature/other", slug: "finish-widget" }, undefined, undefined, context.ctx);

		pi.assertDone();
		expect(result.isError).toBeUndefined();
		expect(result.details).toEqual({
			type: "queued",
			branch: "feature/other",
			slug: "finish-widget",
			command: "/handoff:self-pickup --branch feature/other finish-widget",
		});
		expect(pi.sentUserMessageCalls).toEqual([
			{
				content: "/handoff:self-pickup --branch feature/other finish-widget",
				options: { deliverAs: "followUp" },
			},
		]);
	});

	test("handoff:self-pickup clears context and sends natural pickup prompt in the replacement session", async () => {
		const result = await runCommand(
			"handoff:self-pickup",
			"finish-widget",
			[branchStep(), checkStep(BRANCH, "finish-widget.md", true)],
			{ sessionFile: "/sessions/current.jsonl" },
		);

		result.pi.assertDone();
		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.newSessionCalls).toEqual([{ parentSession: "/sessions/current.jsonl" }]);
		expect(result.replacementNotifications).toEqual([
			{ message: `Picking up handoff finish-widget from branch ${BRANCH}…`, level: "info" },
		]);
		expect(result.replacementUserMessages).toEqual([
			{ content: formatHandoffSelfKickoffPrompt(BRANCH, "finish-widget"), options: undefined },
		]);
		expect(result.statuses).toEqual(["verifying saved handoff…", undefined, "clearing context…", undefined]);
	});

	test("handoff:self-pickup stops before clearing context when the handoff is missing", async () => {
		const result = await runCommand("handoff:self-pickup", `--branch ${BRANCH} missing`, [checkStep(BRANCH, "missing.md", false)]);

		result.pi.assertDone();
		expect(result.newSessionCalls).toEqual([]);
		expect(result.replacementUserMessages).toEqual([]);
		expect(result.notifications).toEqual([
			{ message: `No handoff missing found on branch ${BRANCH}; context was not cleared.`, level: "error" },
		]);
	});
});

describe("handoff:self pure helpers", () => {
	test("handoff:self prompt requires launch tool ordering and context-clear abort wording", () => {
		const prompt = buildHandoffSelfPrompt({
			skillBlock: "# handoff-create skill",
			request: { focus: "make a fresh session", branch: BRANCH },
		});

		expect(prompt).toContain("# handoff-create skill");
		expect(prompt).toContain("This is a /handoff:self request.");
		expect(prompt).toContain("clear this session's context");
		expect(prompt).toContain("If it exists, stop; do not overwrite and do not clear context or pick up the handoff.");
		expect(prompt).toContain("After `brmem put` succeeds, call handoff_self_queue_pickup");
		expect(prompt).toContain("/handoff:self-pickup <returned-slug>");
		expect(prompt).not.toContain(`/handoff:self-pickup --branch ${BRANCH} <returned-slug>`);
		expect(prompt).toContain(formatHandoffSelfKickoffPrompt(BRANCH, "<returned-slug>"));
		expect(prompt).not.toContain(`/handoff:pickup --branch ${BRANCH} <returned-slug>`);
	});
});
