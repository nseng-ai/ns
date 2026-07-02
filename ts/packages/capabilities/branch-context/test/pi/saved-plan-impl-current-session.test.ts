import { describe, expect, test } from "vitest";

import registerBranchContextExtension, {
	buildImplCurrentSavedPlanPrompt,
	parseImplCurrentSavedPlanArgs,
} from "../../src/pi/extension.ts";
import {
	DEFAULT_PLAN_CONTENT,
	FakePi,
	ROOT,
	branchContextExtensionTestOptions,
	createBranchContextOperationFakes,
	createContext,
	makeNamedPlanFile,
	savedPlanEvidence,
	sourcePlanToolResultEntry,
} from "./branch-context-extension-support.ts";
import type { SelectedSavedPlanFile } from "@sdl/plans/api";

describe("saved-plan current-branch implementation command", () => {
	test("registers /sdl:plan:impl-current and shows usage without mutation", async () => {
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("sdl:plan:impl-current");
		const context = createContext();

		await command?.handler("--help", context.ctx);

		expect(command?.description).toContain("current branch");
		expect(pi.sentMessages[0]?.content).toContain("Usage: /sdl:plan:impl-current");
		expect(pi.sentMessages[0]?.content).toContain("does not create, check out, or attach");
		expect(fakes.selectPlanCalls).toEqual([]);
		expect(fakes.createBranchCalls).toEqual([]);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("dry-run with explicit path selects a saved plan without checkout, attachment, or new session", async () => {
		const filePath = await makeNamedPlanFile("current-branch-plan.md", DEFAULT_PLAN_CONTENT);
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("sdl:plan:impl-current");
		const context = createContext();

		await command?.handler(`--dry-run ${filePath}`, context.ctx);

		expect(fakes.selectPlanCalls[0]?.[1]).toMatchObject({
			cwd: ROOT,
			explicitPath: filePath,
			shouldFallbackToLatest: true,
		});
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.execCalls).toEqual([]);
		expect(context.replacementUserMessages).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch would be created");
		expect(pi.sentMessages[0]?.content).toContain("no checkout would happen");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
	});

	test("normal execution starts a fresh session with embedded saved plan content", async () => {
		const filePath = await makeNamedPlanFile("current-branch-plan.md", DEFAULT_PLAN_CONTENT);
		const events: string[] = [];
		const pi = new FakePi([], events);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("sdl:plan:impl-current");
		const context = createContext(events, { sessionFile: "/sessions/current.jsonl" });

		await command?.handler(filePath, context.ctx);

		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.newSessionParentSessions).toEqual(["/sessions/current.jsonl"]);
		expect(context.replacementUserMessages).toHaveLength(1);
		const prompt = context.replacementUserMessages[0] ?? "";
		expect(prompt).toContain("# Saved Plan implementation");
		expect(prompt).toContain(`Path: ${filePath}`);
		expect(prompt).toContain(DEFAULT_PLAN_CONTENT);
		expect(prompt).toContain("----- BEGIN SAVED PLAN -----");
		expect(prompt).not.toContain("/sdl:branch-context:impl-attached-plan");
		expect(context.wasSessionReplaced()).toBe(true);
		expect(events).toContain("replacement-send");
	});

	test("no path passes session entries and prefers the selected session saved plan", async () => {
		const filePath = await makeNamedPlanFile("session-plan.md", "# Session Plan\n");
		const sessionEvidence = savedPlanEvidence({ slug: "session-plan", filePath });
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile(): Promise<SelectedSavedPlanFile> {
				return {
					type: "session",
					savedPlanFileStem: "session-plan",
					plan: {
						...sessionEvidence,
						repoDirectoryPath: "/plans/repo",
						directoryPath: "/plans/repo/source-branch",
						fileName: "session-plan.md",
						modifiedTimeMs: 200,
						summary: "session summary",
					},
				};
			},
		});
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("sdl:plan:impl-current");
		const sessionEntry = sourcePlanToolResultEntry(sessionEvidence);
		const context = createContext([], { sessionEntries: [sessionEntry] });

		await command?.handler("--dry-run", context.ctx);

		expect(fakes.selectPlanCalls[0]?.[1]).toMatchObject({
			sessionEntries: [sessionEntry],
			shouldFallbackToLatest: true,
		});
		expect(pi.sentMessages[0]?.content).toContain("Saved plan from current session");
		expect(pi.sentMessages[0]?.content).toContain("Summary: session summary");
	});

	test("rejects branch creation flags as not applicable", () => {
		expect(() => parseImplCurrentSavedPlanArgs("--branch feature/demo")).toThrow(
			"--branch is not supported",
		);
		expect(() => parseImplCurrentSavedPlanArgs("--graphite")).toThrow("does not create branches");
		expect(() => parseImplCurrentSavedPlanArgs("--plain-git")).toThrow("does not create branches");
	});

	test("new-session cancellation reports a non-mutating continuation path", async () => {
		const filePath = await makeNamedPlanFile("cancelled-plan.md", DEFAULT_PLAN_CONTENT);
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("sdl:plan:impl-current");
		const context = createContext([], { shouldCancelNewSession: true });

		await command?.handler(filePath, context.ctx);

		expect(context.wasSessionReplaced()).toBe(false);
		expect(context.replacementUserMessages).toEqual([]);
		const warning = pi.sentMessages.at(-1)?.content ?? "";
		expect(warning).toContain("starting the implementation session was cancelled");
		expect(warning).toContain(`/sdl:plan:impl-current ${filePath}`);
		expect(warning).toContain("manually open /new on the current branch");
	});

	test("no-UI cancellation does not write launch runtime status", async () => {
		const filePath = await makeNamedPlanFile("no-ui-cancelled-plan.md", DEFAULT_PLAN_CONTENT);
		const events: string[] = [];
		const pi = new FakePi([], events);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("sdl:plan:impl-current");
		const context = createContext(events, { hasUI: false, shouldCancelNewSession: true });

		await command?.handler(filePath, context.ctx);

		expect(context.wasSessionReplaced()).toBe(false);
		expect(context.statuses).not.toContainEqual({
			key: "sdl:plan:impl-current",
			value: "starting implementation session…",
		});
		expect(context.statuses).toEqual([]);
	});

	test("prompt builder uses saved-plan vocabulary and embeds delimiters", () => {
		const prompt = buildImplCurrentSavedPlanPrompt({
			mode: "explicit",
			filePath: "/tmp/demo.md",
			fileName: "demo.md",
			savedPlanFileStem: "demo",
			planContent: "# Demo\n",
		});

		expect(prompt).toContain("# Saved Plan implementation");
		expect(prompt).toContain("No Branch Context was created");
		expect(prompt).toContain("----- BEGIN SAVED PLAN -----\n# Demo");
		expect(prompt).toContain("----- END SAVED PLAN -----");
	});
});
