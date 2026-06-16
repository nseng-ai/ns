import { describe, expect, test } from "vitest";

import { buildHandoffLaunchRequest, runHandoffCreateCommand, type HandoffLaunchPromptCopy } from "../src/handoff/launch-flow.ts";
import { createHandoffStartMessage, type HandoffStartMessages } from "../src/handoff/shared.ts";
import { BRANCH, FakePi, branchStep, createContext, skillCommandInfo, withTempSkill } from "./handoff-test-fakes.ts";

const START_MESSAGES = {
	ready: "Starting test handoff flow…",
	fallbackLabel: "test handoff fallback",
} satisfies HandoffStartMessages;

const PROMPT_COPY = {
	commandName: "handoff:test",
	toolName: "handoff_test_launch",
	intentSentence: "Create a test handoff and launch it.",
	abortClause: "do not launch the test handoff",
	previewHeading: "After saving, launch with:",
	previewBody(branch: string): string {
		return `test launch ${branch}`;
	},
} satisfies HandoffLaunchPromptCopy;

describe("handoff launch flow helpers", () => {
	test("buildHandoffLaunchRequest trims and validates continuation focus", () => {
		expect(buildHandoffLaunchRequest({ branch: "feature/handoff", focus: "  continue auth work  " })).toEqual({
			type: "valid",
			request: { branch: "feature/handoff", focus: "continue auth work" },
		});
		expect(buildHandoffLaunchRequest({ branch: "feature/handoff", focus: " !!! " })).toEqual({
			type: "invalid",
			message: "Continuation focus must contain at least one letter or number.",
		});
	});

	test("runHandoffCreateCommand prepares and sends the standard launch prompt", async () => {
		await withTempSkill(async (skillPath, repoDir) => {
			const pi = new FakePi([branchStep()], [skillCommandInfo(skillPath)]);
			const context = createContext({ cwd: repoDir });

			await runHandoffCreateCommand(pi, "  finish the widget  ", context.ctx, {
				statusKey: "handoff:test",
				promptCopy: PROMPT_COPY,
				startMessages: START_MESSAGES,
			});

			pi.assertDone();
			expect(context.waitForIdleCalls()).toBe(1);
			expect(context.notifications).toEqual([{ message: "Starting test handoff flow…", level: "info" }]);
			expect(pi.sentUserMessages).toHaveLength(1);
			const prompt = pi.sentUserMessages[0] ?? "";
			expect(prompt).toContain(`<skill name="handoff-create" location="${skillPath}">`);
			expect(prompt).toContain("This is a /handoff:test request.");
			expect(prompt).toContain("finish the widget");
			expect(prompt).toContain(`- Branch: ${BRANCH}`);
			expect(prompt).toContain("After `brmem put` succeeds, call handoff_test_launch");
			expect(prompt).toContain(`test launch ${BRANCH}`);
		});
	});

	test("createHandoffStartMessage formats skill fallback states", () => {
		expect(
			createHandoffStartMessage(
				START_MESSAGES,
				{ name: "handoff-create", commandName: "skill:handoff-create", path: "/skill", baseDir: "/", body: "# skill", block: "# skill" },
				undefined,
			),
		).toBe(
			"Starting test handoff flow…",
		);
		expect(createHandoffStartMessage(START_MESSAGES, undefined, "read failed")).toBe(
			"Could not read handoff-create skill; using fallback test handoff fallback. read failed",
		);
		expect(createHandoffStartMessage(START_MESSAGES, undefined, undefined)).toBe(
			"handoff-create skill was not found; using fallback test handoff fallback.",
		);
	});
});
