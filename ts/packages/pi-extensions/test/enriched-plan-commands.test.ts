import { describe, expect, test } from "vitest";
import { join, resolve } from "node:path";

import { BRANCH_CONTEXT_NAMESPACE, formatImplBranchContextCommand } from "@asdl/branch-context";
import { NoSavedPlanAvailableError } from "@asdl/plans";
import registerBranchContextExtension, {
	CREATE_BRANCH_CONTEXT_USAGE,
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
} from "../src/branch-context-extension.ts";

import {
	DEFAULT_PLAN_CONTENT,
	FakePi,
	IMPL_BRANCH,
	IMPL_PLAN_CONTENT,
	IMPL_REF,
	PLAN_KEY,
	PLAN_SLUG,
	ROOT,
	SOURCE_BRANCH,
	attachedPlan,
	brmemListAttachedPlansStep,
	createBranchContextOperationFakes,
	createContext,
	gitCheckoutStep,
	gitCurrentBranchStep,
	gitOriginStep,
	gitRootStep,
	makeNamedPlanFile,
	makeTempDir,
	planSlugExecCall,
	planSlugStep,
	planStoreDirectory,
	branchContextEvidence,
	branchContextOutputMessageEntry,
	resolveWritePlanPromptStep,
	savedPlanFileContent,
	sourcePlanEvidence,
	sourcePlanToolResultEntry,
	step,
	writePlanStoreFile,
} from "./branch-context-extension-support.ts";

const CUSTOM_PLAN_KEY = "custom-plan.md";
const DEFAULT_IMPL_COMMAND = formatImplBranchContextCommand(PLAN_KEY);
const CUSTOM_IMPL_COMMAND = formatImplBranchContextCommand(CUSTOM_PLAN_KEY);

function missingPlanStoreError(): Error {
	return new NoSavedPlanAvailableError({
		reason: "missing-directory",
		directoryPath: "/missing/plans/owner/repo/source-branch",
		message: [
			"No local plan store directory exists for the current repository and branch.",
			"Plan store directory: /missing/plans/owner/repo/source-branch",
			"Repo key: gh--owner--repo",
			"Source branch: source-branch",
			"Branch path segment: source-branch",
			"Create a saved plan first, or pass an explicit absolute or home-relative plan file path.",
		].join("\n"),
	});
}

function emptyPlanStoreError(): Error {
	return new NoSavedPlanAvailableError({
		reason: "no-plan-files",
		directoryPath: "/plans/owner/repo/source-branch",
		message: [
			"No Markdown saved plan files exist in the local plan store for the current repository and branch.",
			"Plan store directory: /plans/owner/repo/source-branch",
			"Create a saved plan first, or pass an explicit absolute or home-relative plan file path.",
		].join("\n"),
	});
}
describe("enriched-plan-commands", () => {
	test("registers plans write commands, branch-context workflow commands, and write tool", () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"branch-context:from-plan",
			"branch-context:impl",
			"branch-context:upstack-impl-session",
			"enriched-plan:grill-and-save",
			"enriched-plan:save",
		]);
		expect([...pi.commands.keys()].filter((name) => name.startsWith("enriched-plan:"))).toEqual(["enriched-plan:save", "enriched-plan:grill-and-save"]);
		expect(pi.tools.has("write_saved_plan_file")).toBe(true);
		expect([...pi.tools.keys()]).toEqual(["write_saved_plan_file"]);
	});

	test("enriched-plan:grill-and-save waits for idle and dispatches embedded prompt without prompt resolution", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("enriched-plan:grill-and-save");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  plan the grilled command variant  ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([buildWriteGrilledPlanPrompt("plan the grilled command variant")]);
		expect(pi.sentUserMessages[0]).toContain("grill_ask");
		expect(pi.sentUserMessages[0]).toContain("write_saved_plan_file");
		expect(context.notifications).toEqual([
			{ message: "Starting /enriched-plan:grill-and-save planning grill…", level: "info" },
		]);
	});

	test("enriched-plan:grill-and-save with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const command = pi.commands.get("enriched-plan:grill-and-save");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWriteGrilledPlanPrompt("")]);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("enriched-plan:save waits for idle, resolves prompt, and dispatches the generated prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([resolveWritePlanPromptStep()], events);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("enriched-plan:save");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  add a tiny docs note plan for testing  ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.execCalls).toEqual([
			{
				command: "asdl",
				args: ["exec", "resolve-prompt", "plans-write", "--format", "json"],
				options: { cwd: ROOT, timeout: 10_000 },
			},
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toBe(buildWritePlanPrompt("add a tiny docs note plan for testing"));
		expect(pi.sentUserMessages[0]).toContain("write_saved_plan_file");
		expect(pi.sentUserMessages[0]).toContain("~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md");
		expect(pi.sentUserMessages[0]).toContain("completely fresh downstream implementation session");
		expect(pi.sentUserMessages[0]).toContain("External research/context contract");
		expect(pi.sentUserMessages[0]).not.toContain("create_brmem_plan_branch_from_file");
		expect(pi.sentUserMessages[0]).not.toContain("branchCreation");
		expect(context.notifications).toEqual([{ message: "Starting /enriched-plan:save planning turn…", level: "info" }]);
	});

	test("enriched-plan:save with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep()]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("enriched-plan:save");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("enriched-plan:save uses custom resolved prompt body", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep({ content: "Custom plan body\n" })]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("enriched-plan:save");
		const context = createContext();

		await command?.handler("customize this", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("customize this", "Custom plan body\n")]);
		expect(context.notifications).toEqual([{ message: "Starting /enriched-plan:save planning turn…", level: "info" }]);
	});

	test("enriched-plan:save falls back and warns when resolver fails", async () => {
		const pi = new FakePi([
			resolveWritePlanPromptStep({ result: { code: 1, stdout: "", stderr: "prompt_not_found: missing" } }),
		]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("enriched-plan:save");
		const context = createContext();

		await command?.handler("fallback please", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("fallback please")]);
		expect(context.notifications).toEqual([
			{ message: "Starting /enriched-plan:save planning turn…", level: "info" },
			{
				message:
					"Falling back to built-in /enriched-plan:save prompt body because asdl exec resolve-prompt failed with exit code 1: prompt_not_found: missing",
				level: "warning",
			},
		]);
	});

	test("enriched-plan:save falls back without UI warning when resolver returns malformed JSON", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep({ result: { stdout: "not json" } })]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("enriched-plan:save");
		const context = createContext([], { hasUI: false });

		await command?.handler("malformed", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("malformed")]);
		expect(context.notifications).toEqual([]);
	});
});
