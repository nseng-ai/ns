import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { createPiHandoffGitGateway } from "../../src/pi/api-context.ts";
import { createHandoffLaunchIntegration } from "../../src/pi/handoff-launch.ts";
import handoffExtension from "../../src/pi/registration.ts";
import { createPiCommandExecApi } from "@nseng-ai/pi/shared/command-exec";
import {
	buildHandoffLaunchRequest,
	runHandoffCreateCommand,
	type HandoffLaunchPromptCopy,
} from "../../src/pi/launch-flow.ts";
import { type HandoffStartMessages, createHandoffStartMessage } from "../../src/pi/ui-status.ts";
import {
	BRANCH,
	FakePi,
	branchStep,
	createContext,
	skillCommandInfo,
	withHandoffCreateSkill,
} from "./handoff-test-fakes.ts";

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

describe("handoff launch integration", () => {
	test("registers the shared content slug tool once across Handoffs and Herdr requests", () => {
		const pi = new FakePi();

		handoffExtension(pi);
		createHandoffLaunchIntegration(pi).registerContentSlugTool();
		createHandoffLaunchIntegration(pi).registerContentSlugTool();

		expect(
			pi.toolRegistrationNames.filter((name) => name === "derive_handoff_slug_from_content"),
		).toEqual(["derive_handoff_slug_from_content"]);
	});

	test("does not register the shared slug tool through a second scoped Pi API", () => {
		const sharedToolNames = new Set<string>();
		const firstPi = new FakePi([], [], { sharedToolNames });
		const secondPi = new FakePi([], [], { sharedToolNames });

		createHandoffLaunchIntegration(firstPi).registerContentSlugTool();
		createHandoffLaunchIntegration(secondPi).registerContentSlugToolIfMissing();

		expect(firstPi.toolRegistrationNames).toEqual(["derive_handoff_slug_from_content"]);
		expect(secondPi.toolRegistrationNames).toEqual([]);
	});
});

describe("handoff launch flow helpers", () => {
	test("buildHandoffLaunchRequest trims and validates continuation focus", () => {
		expect(
			buildHandoffLaunchRequest({ branch: "feature/handoff", focus: "  continue auth work  " }),
		).toEqual({
			type: "valid",
			request: { branch: "feature/handoff", focus: "continue auth work" },
		});
		expect(buildHandoffLaunchRequest({ branch: "feature/handoff", focus: " !!! " })).toEqual({
			type: "invalid",
			message: "Continuation focus must contain at least one letter or number.",
		});
	});

	test("runHandoffCreateCommand prepares and sends the standard launch prompt", async () => {
		await withHandoffCreateSkill(async ({ skillPath, repoDir }) => {
			const pi = new FakePi([branchStep()], [skillCommandInfo(skillPath)]);
			const context = createContext({
				cwd: repoDir,
				sessionFile: "/sessions/launch-filename.jsonl",
				sessionId: "launch-source-id",
			});

			await runHandoffCreateCommand(pi, "  finish the widget  ", context.ctx, {
				git: createPiHandoffGitGateway(createPiCommandExecApi(pi)),
				statusKey: "handoff:test",
				promptCopy: PROMPT_COPY,
				startMessages: START_MESSAGES,
			});

			pi.assertDone();
			expect(context.waitForIdleCalls()).toBe(1);
			expect(context.notifications).toEqual([
				{ message: "Starting test handoff flow…", level: "info" },
			]);
			expect(pi.sentUserMessages).toHaveLength(1);
			const prompt = pi.sentUserMessages[0] ?? "";
			expect(prompt).toContain(`<skill name="handoff-create" location="${skillPath}">`);
			expect(prompt).toContain("This is a /handoff:test request.");
			expect(prompt).toContain("finish the widget");
			expect(prompt).toContain("Source Pi session ID: launch-source-id");
			expect(prompt).toContain("Source Pi session log: /sessions/launch-filename.jsonl");
			expect(prompt).toContain(`- Branch: ${BRANCH}`);
			expect(prompt).toContain("After `ns handoff create` succeeds, call handoff_test_launch");
			expect(prompt).toContain(`test launch ${BRANCH}`);
		});
	});

	test("runHandoffCreateCommand resolves the branch from supplied handoff context", async () => {
		await withHandoffCreateSkill(async ({ skillPath, repoDir }) => {
			const pi = new FakePi([], [skillCommandInfo(skillPath)]);
			const context = createContext({ cwd: repoDir });
			const git = new InMemoryGitGateway({ currentBranch: "context/branch" });

			await runHandoffCreateCommand(pi, "finish the widget", context.ctx, {
				git,
				statusKey: "handoff:test",
				promptCopy: PROMPT_COPY,
				startMessages: START_MESSAGES,
			});

			pi.assertDone();
			expect(pi.execCalls).toEqual([]);
			expect(pi.sentUserMessages[0]).toContain("- Branch: context/branch");
		});
	});

	test("createHandoffStartMessage formats skill fallback states", () => {
		expect(
			createHandoffStartMessage(
				START_MESSAGES,
				{
					name: "handoff-create",
					commandName: "skill:handoff-create",
					path: "/skill",
					baseDir: "/",
					body: "# skill",
					block: "# skill",
				},
				undefined,
			),
		).toBe("Starting test handoff flow…");
		expect(createHandoffStartMessage(START_MESSAGES, undefined, "read failed")).toBe(
			"Could not read handoff-create skill; using fallback test handoff fallback. read failed",
		);
		expect(createHandoffStartMessage(START_MESSAGES, undefined, undefined)).toBe(
			"handoff-create skill was not found; using fallback test handoff fallback.",
		);
	});
});
