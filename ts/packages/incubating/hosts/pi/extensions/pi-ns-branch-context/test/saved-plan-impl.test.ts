import { describe, expect, test } from "vitest";

import registerBranchContextExtension, {
	buildImplSavedPlanPrompt,
	parseImplSavedPlanArgs,
} from "../src/extension.ts";
import {
	DEFAULT_PLAN_CONTENT,
	FakePi,
	ROOT,
	branchContextExtensionTestOptions,
	createBranchContextOperationFakes,
	createContext,
	makeNamedPlanFile,
} from "./branch-context-extension-support.ts";

describe("saved-plan implementation command", () => {
	test("registers /ns:plan:impl-saved-plan and shows usage without mutation", async () => {
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:plan:impl-saved-plan");
		const context = createContext();

		await command?.handler("--help", context.ctx);

		expect(command?.description).toContain("fresh current-branch Pi session");
		expect(command?.description).toContain("session-discovered");
		expect(command?.description).not.toContain("latest fallback");
		expect(pi.sentMessages[0]?.content).toContain("Usage: /ns:plan:impl-saved-plan");
		expect(pi.sentMessages[0]?.content).toContain("does not create or check out a branch");
		expect(pi.sentMessages[0]?.content).toContain("never falls back to the newest Saved Plan");
		expect(pi.sentMessages[0]?.content).toContain(
			"An explicit file path selects that Saved Plan even when it is older",
		);
		expect(fakes.selectPlanCalls).toEqual([]);
		expect(fakes.createBranchCalls).toEqual([]);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("dry-run with explicit path selects a saved plan without checkout, attachment, or new session", async () => {
		const filePath = await makeNamedPlanFile("current-branch-plan.md", DEFAULT_PLAN_CONTENT);
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:plan:impl-saved-plan");
		const context = createContext();

		await command?.handler(`--dry-run ${filePath}`, context.ctx);

		expect(fakes.selectPlanCalls[0]?.[1]).toMatchObject({
			cwd: ROOT,
			explicitPath: filePath,
			shouldFallbackToLatest: false,
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
		const command = pi.commands.get("ns:plan:impl-saved-plan");
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
		expect(prompt).not.toContain("/ns:branch-context:impl-attached-plan");
		expect(context.wasSessionReplaced()).toBe(true);
		expect(events).toContain("replacement-send");
	});

	test("rejects branch creation flags as not applicable", () => {
		expect(() => parseImplSavedPlanArgs("--branch feature/demo")).toThrow(
			"--branch is not supported",
		);
		expect(() => parseImplSavedPlanArgs("--graphite")).toThrow("does not create branches");
		expect(() => parseImplSavedPlanArgs("--plain-git")).toThrow("does not create branches");
	});

	test("new-session cancellation reports a non-mutating continuation path", async () => {
		const filePath = await makeNamedPlanFile("cancelled-plan.md", DEFAULT_PLAN_CONTENT);
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:plan:impl-saved-plan");
		const context = createContext([], { shouldCancelNewSession: true });

		await command?.handler(filePath, context.ctx);

		expect(context.wasSessionReplaced()).toBe(false);
		expect(context.replacementUserMessages).toEqual([]);
		const warning = pi.sentMessages.at(-1)?.content ?? "";
		expect(warning).toContain("starting the implementation session was cancelled");
		expect(warning).toContain(`/ns:plan:impl-saved-plan ${filePath}`);
		expect(warning).toContain("manually open /new on the current branch");
	});

	test("no-UI cancellation does not write launch runtime status", async () => {
		const filePath = await makeNamedPlanFile("no-ui-cancelled-plan.md", DEFAULT_PLAN_CONTENT);
		const events: string[] = [];
		const pi = new FakePi([], events);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, branchContextExtensionTestOptions(fakes.operations));
		const command = pi.commands.get("ns:plan:impl-saved-plan");
		const context = createContext(events, { hasUI: false, shouldCancelNewSession: true });

		await command?.handler(filePath, context.ctx);

		expect(context.wasSessionReplaced()).toBe(false);
		expect(context.statuses).not.toContainEqual({
			key: "ns:plan:impl-saved-plan",
			value: "starting implementation session…",
		});
		expect(context.statuses).toEqual([]);
	});

	test("prompt builder uses saved-plan vocabulary and embeds delimiters", () => {
		const prompt = buildImplSavedPlanPrompt({
			mode: "explicit",
			filePath: "/tmp/demo.md",
			fileName: "demo.md",
			savedPlanFileStem: "demo",
			planContent: "# Demo\n",
		});

		expect(prompt).toContain("# Saved Plan implementation");
		expect(prompt).toContain("No Branch Context was created");
		expect(prompt).toContain(
			"universal STOP triggers: excerpt mismatch; ambiguity or internal inconsistency; implementation requires touching an out-of-scope file/area; or the plan asks for mutating Branch Memory",
		);
		expect(prompt).not.toContain("verification gate fails twice");
		expect(prompt).not.toContain("fails twice after reasonable local attempts");
		expect(prompt).not.toContain("do not commit, push, submit, or publish");
		expect(prompt).toContain(
			"Investigate validation failures, rerun appropriate gates after fixes, and report unresolved failures accurately",
		);
		expect(prompt).toContain(
			"Report implemented changes, files changed/tree state, validation results",
		);
		expect(prompt).toContain("----- BEGIN SAVED PLAN -----\n# Demo");
		expect(prompt).toContain("----- END SAVED PLAN -----");
	});
});
