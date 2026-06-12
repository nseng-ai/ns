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

describe("plan workflow commands", () => {
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

	test("branch-context:impl waits, loads the attached plan, and sends an implementation prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		const fakes = createBranchContextOperationFakes({ loadBranchContextPlan: async () => attachedPlan({ refName: IMPL_REF }) });
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(pi.execCalls).toEqual([]);
		expect(fakes.loadPlanCalls).toHaveLength(1);
		expect(fakes.loadPlanCalls[0]?.[1]).toEqual({});
		expect(context.notifications).toEqual([{ message: "Loading attached branch-context plan…", level: "info" }]);
		expect(context.statuses).toEqual([
			{ key: "branch-context:impl", value: "loading attached plan…" },
			{ key: "branch-context:impl", value: undefined },
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("branch-context-output");
		expect(pi.sentMessages[0]?.content).toContain("Loaded attached branch-context plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentMessages[0]?.content).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("The attached branch-context plan has been loaded by the planning-layer reader.");
		expect(pi.sentUserMessages[0]).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentUserMessages[0]).toContain(`Namespace: ${BRANCH_CONTEXT_NAMESPACE}`);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages[0]).toContain(`Bytes: ${new TextEncoder().encode(IMPL_PLAN_CONTENT).length}`);
		expect(pi.sentUserMessages[0]).toContain(IMPL_PLAN_CONTENT);
		expect(pi.sentUserMessages[0]).toContain("Create an implementation checklist");
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("branch-context:impl passes a requested slug into attached-plan selection", async () => {
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		const context = createContext();

		await command?.handler(`  ${PLAN_SLUG}  `, context.ctx);

		pi.assertDone();
		expect(fakes.loadPlanCalls[0]?.[1]).toEqual({ requestedKey: PLAN_SLUG });
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("branch-context:impl presents saved-plan fallback evidence", async () => {
		const planContent = "# Saved Impl Plan\n\n- Implement from the saved plan.\n";
		const filePath = "/tmp/source-plan-store/branch-scoped-plan-extension.md";
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes({
			loadBranchContextPlan: async () =>
				attachedPlan({
					branch: SOURCE_BRANCH,
					namespace: "local-plan-store",
					refName: filePath,
					content: planContent,
					source: "saved",
					sourceFile: filePath,
				}),
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Loaded saved branch-context plan from local plan store.");
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("The saved branch-context plan from the local plan store has been loaded");
		expect(pi.sentUserMessages[0]).toContain(`Namespace: local-plan-store`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages[0]).toContain(`----- BEGIN SAVED PLAN -----\n${planContent}\n----- END SAVED PLAN -----`);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("branch-context:impl presents load failures without sending an implementation prompt", async () => {
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes({
			async loadBranchContextPlan() {
				throw new Error("Refusing to implement directly on trunk (`main`)");
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("branch-context-output");
		expect(pi.sentMessages[0]?.content).toContain("Failed to load branch-context plan.");
		expect(pi.sentMessages[0]?.content).toContain("Refusing to implement directly on trunk (`main`)");
		expect(pi.execCalls).toEqual([]);
		expect(context.statuses.at(-1)).toEqual({ key: "branch-context:impl", value: undefined });
	});

	test("branch-context:from-plan help displays usage without mutation", async () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext();

		await command?.handler("--help", context.ctx);

		expect(context.waits()).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(CREATE_BRANCH_CONTEXT_USAGE);
	});

	test("branch-context:from-plan dry-run resolves latest local plan store without mutating", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const filePath = await writePlanStoreFile(directoryPath, `${PLAN_KEY}`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(PLAN_KEY))]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext();

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["config", "--get", "remote.origin.url"] },
			planSlugExecCall(savedPlanFileContent(PLAN_KEY)),
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch was created and no plan was attached.");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: plan`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(context.statuses.at(-1)).toEqual({ key: "branch-context:from-plan", value: undefined });
	});

	test("branch-context:from-plan dry-run prefers session-created plan over newer disk mtime", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const newerDiskSlug = "harden-cp-autobranch-validation";
		const sessionKey = `${sessionSlug}.md`;
		const contentSlug = "add-session-branch-context";
		const sessionPath = await writePlanStoreFile(directoryPath, sessionKey, 1_700_000_000_000);
		await writePlanStoreFile(directoryPath, `${newerDiskSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(sessionKey), contentSlug)]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Saved plan from current session:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${sessionPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${sessionSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`${newerDiskSlug}.md`);
	});

	test("branch-context:from-plan explicit path wins over session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const explicitSlug = "harden-cp-autobranch-validation";
		const sessionPath = await writePlanStoreFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const explicitKey = `${explicitSlug}.md`;
		const contentSlug = "add-docs-portal-site";
		const explicitPath = await writePlanStoreFile(directoryPath, explicitKey, 1_800_000_000_000);
		const pi = new FakePi([planSlugStep(savedPlanFileContent(explicitKey), contentSlug)]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }))],
		});

		await command?.handler(`--dry-run ${explicitPath}`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(savedPlanFileContent(explicitKey))]);
		expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${explicitPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${explicitSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain("Saved plan from current session:");
	});

	test("branch-context:from-plan explicit path dry-run uses a content-derived slug instead of the filename", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const contentSlug = "add-docs-portal-site";
		const content = "# Add Docs Portal Site\n\nBuild the docs portal and deploy it.\n";
		const filePath = await makeNamedPlanFile(`${savedPlanStem}.md`, content);

		for (const rawPath of [filePath, `@${filePath}`]) {
			const pi = new FakePi([planSlugStep(content, contentSlug)]);
			registerBranchContextExtension(pi);
			const command = pi.commands.get("branch-context:from-plan");

			await command?.handler(`--dry-run ${rawPath}`, createContext().ctx);

			pi.assertDone();
			expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(content)]);
			expect(pi.sentMessages).toHaveLength(1);
			expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
			expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
			expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${savedPlanStem}`);
			expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
			expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
			expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
			expect(pi.sentMessages[0]?.content).not.toContain(`Branch: ${savedPlanStem}`);
		}
	});

	test("branch-context:from-plan dry-run repairs overlong model slug output", async () => {
		const filePath = await makeNamedPlanFile();
		const rawOutput = "asdl docs site slot page conventions skeleton theme foundation\n";
		const repairedSlug = "asdl-docs-site-slot-page-conventions-skeleton";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, repairedSlug, { stdout: rawOutput })]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["pi"]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
	});

	test("branch-context:from-plan ignores missing session file and falls back to disk latest", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const missingSlug = "submit-dirty-worktree-checkpoint";
		const diskSlug = "harden-cp-autobranch-validation";
		const missingPath = join(directoryPath, `${missingSlug}.md`);
		const diskKey = `${diskSlug}.md`;
		const diskPath = await writePlanStoreFile(directoryPath, diskKey, 1_800_000_000_000);
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
			planSlugStep(savedPlanFileContent(diskKey), diskSlug),
		]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: missingSlug, filePath: missingPath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Latest saved plan from local plan store:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${diskPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${diskSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${diskSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain("Saved plan from current session:");
	});

	test("branch-context:from-plan rejects wrong repo or branch session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const sessionPath = await writePlanStoreFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const wrongBranchEvidence = {
			...sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }),
			sourceBranch: "other-branch",
			branchKey: "other-branch",
		};
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(wrongBranchEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Failed to resolve saved plan file or derive branch slug.");
		expect(pi.sentMessages[0]?.content).toContain("different repo or branch");
		expect(pi.sentMessages[0]?.content).toContain("sourceBranch");
		expect(pi.sentMessages[0]?.content).toContain("branchKey");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("branch-context:from-plan rejects outside-plan-store session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const outsidePath = await makeNamedPlanFile(`${PLAN_KEY}`);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: PLAN_SLUG, filePath: outsidePath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Session saved-plan evidence basename must match slug");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("branch-context:from-plan rejects wrong branch key even when source branch matches", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const sessionPath = await writePlanStoreFile(directoryPath, `${sessionSlug}.md`, 1_700_000_000_000);
		const wrongBranchKeyEvidence = {
			...sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch }),
			branchKey: "wrong-branch-key",
		};
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(wrongBranchKeyEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("branchKey");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("branch-context:from-plan rejects basename and slug mismatch in session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionPath = await writePlanStoreFile(directoryPath, `${PLAN_SLUG}.md`, 1_700_000_000_000);
		const mismatchEvidence = sourcePlanEvidence({ slug: "submit-dirty-worktree-checkpoint", filePath: sessionPath, sourceBranch });
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(mismatchEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("basename must match slug");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("branch-context:from-plan ignores stale cancellation output while using tool result evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const staleSlug = "harden-cp-autobranch-validation";
		const contentSlug = "restore-session-plan-selection";
		const sessionKey = `${sessionSlug}.md`;
		const sessionPath = await writePlanStoreFile(directoryPath, sessionKey, 1_700_000_000_000);
		const stalePath = await writePlanStoreFile(directoryPath, `${staleSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(sessionKey), contentSlug)]);
		registerBranchContextExtension(pi, { planStoreRoot });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext([], {
			sessionEntries: [
				sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch })),
				branchContextOutputMessageEntry(
					`Cancelled: no branch was created and no plan was attached.\n\nLatest saved plan from local plan store:\nPath: ${stalePath}\nSlug: ${staleSlug}`,
				),
			],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Saved plan from current session:");
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${sessionPath}`);
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${sessionSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Path: ${stalePath}`);
	});

	test("branch-context:from-plan creates without interactive confirmation", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)], events);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "plain-git" });
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
	});

	test("branch-context:from-plan surfaces target branch collision without prompting", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)], events);
		const fakes = createBranchContextOperationFakes({
			async createBranchContextFromFile() {
				throw new Error("Target branch already exists; refusing to overwrite.");
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(fakes.createBranchCalls).toHaveLength(1);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Target branch already exists; refusing to overwrite.");
	});

	test("branch-context:from-plan --yes creates a plain-git branch context using the content slug when the filename differs", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const filePath = await makeNamedPlanFile(`${savedPlanStem}.md`);
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "plain-git" });
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Branch: ${savedPlanStem}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Key: ${savedPlanStem}.md`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("branch-context:from-plan --graphite uses Graphite branch creation", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --yes --graphite`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "graphite" });
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("branch-context:from-plan extension options default to Graphite without a branch prefix", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchCreation: "graphite" });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("branch-context:upstack-impl-session creates with Graphite, checks out the branch, and dispatches impl in a new session", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)], events);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext(events, { sessionFile: "/sessions/source.jsonl" });

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "graphite" });
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			planSlugExecCall(DEFAULT_PLAN_CONTENT),
			{ command: "git", args: ["checkout", PLAN_SLUG] },
		]);
		expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
		expect(context.newSessionParentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(events.indexOf("new-session")).toBeGreaterThan(events.indexOf("status"));
		expect(events.indexOf("replacement-send")).toBeGreaterThan(events.indexOf("new-session"));
		expect(context.statuses.at(-1)).toEqual({ key: "branch-context:upstack-impl-session", value: undefined });
	});

	test("branch-context:upstack-impl-session reuses one session-created attached plan when the local plan store is missing", async () => {
		const events: string[] = [];
		const pi = new FakePi([brmemListAttachedPlansStep(IMPL_BRANCH, [{ key: PLAN_KEY }]), gitCheckoutStep(IMPL_BRANCH)], events);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext(events, {
			sessionEntries: [
				branchContextOutputMessageEntry("Created branch context and attached plan.", {
					status: "success",
					evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: PLAN_KEY }),
				}),
			],
		});

		await command?.handler("--yes", context.ctx);

		pi.assertDone();
		expect(fakes.selectPlanCalls).toHaveLength(1);
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", IMPL_BRANCH, "--format", "json"] },
			{ command: "git", args: ["checkout", IMPL_BRANCH] },
		]);
		expect(pi.execCalls.some((call) => call.command === "pi")).toBe(false);
		expect(pi.sentMessages[0]?.content).toContain("Reusing existing branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
	});

	test("branch-context:upstack-impl-session reuses a non-default session-created attached plan", async () => {
		const pi = new FakePi([
			step("brmem", ["check", CUSTOM_PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", IMPL_BRANCH, "--format", "json"], { code: 0 }),
			gitCheckoutStep(IMPL_BRANCH),
		]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext([], {
			sessionEntries: [
				branchContextOutputMessageEntry("Created branch context and attached custom plan.", {
					status: "success",
					evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: CUSTOM_PLAN_KEY }),
				}),
			],
		});

		await command?.handler("--yes", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${CUSTOM_PLAN_KEY}`);
		expect(context.replacementUserMessages).toEqual([CUSTOM_IMPL_COMMAND]);
	});

	test("branch-context:upstack-impl-session reuses an explicit branch when the local plan store is missing", async () => {
		const explicitBranch = "branch-contexts/explicit-target";
		const pi = new FakePi([brmemListAttachedPlansStep(explicitBranch, [{ key: PLAN_KEY }]), gitCheckoutStep(explicitBranch)]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler(`--branch ${explicitBranch}`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", explicitBranch, "--format", "json"] },
			{ command: "git", args: ["checkout", explicitBranch] },
		]);
		expect(pi.sentMessages[0]?.content).toContain("Reuse source: explicit --branch");
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
	});

	test("branch-context:upstack-impl-session dry-run describes explicit branch reuse without checkout", async () => {
		const explicitBranch = "branch-contexts/explicit-target";
		const pi = new FakePi([brmemListAttachedPlansStep(explicitBranch, [{ key: PLAN_KEY }])]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler(`--dry-run --branch ${explicitBranch}`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", explicitBranch, "--format", "json"] },
		]);
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain("Dry run: no branch would be created, no plan would be attached, no checkout would happen");
		expect(content).toContain(`git checkout ${explicitBranch}`);
		expect(content).toContain(DEFAULT_IMPL_COMMAND);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("branch-context:upstack-impl-session dry-run includes non-default keys in the follow-up flow", async () => {
		const pi = new FakePi([
			step("brmem", ["check", CUSTOM_PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", IMPL_BRANCH, "--format", "json"], { code: 0 }),
		]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext([], {
			sessionEntries: [
				branchContextOutputMessageEntry("Created branch context and attached custom plan.", {
					status: "success",
					evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: CUSTOM_PLAN_KEY }),
				}),
			],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain(`Branch Memory key: ${CUSTOM_PLAN_KEY}`);
		expect(content).toContain(`git checkout ${IMPL_BRANCH}`);
		expect(content).toContain(CUSTOM_IMPL_COMMAND);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("branch-context:upstack-impl-session reuses the current branch when the local plan store is missing", async () => {
		const currentBranch = "branch-contexts/current-target";
		const pi = new FakePi([gitCurrentBranchStep(currentBranch), brmemListAttachedPlansStep(currentBranch, [{ key: PLAN_KEY }]), gitCheckoutStep(currentBranch)]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", currentBranch, "--format", "json"] },
			{ command: "git", args: ["checkout", currentBranch] },
		]);
		expect(pi.sentMessages[0]?.content).toContain("Reuse source: current branch");
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
	});

	test("branch-context:upstack-impl-session fails clearly for ambiguous session candidates", async () => {
		const otherBranch = "branch-contexts/other-target";
		const pi = new FakePi();
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext([], {
			sessionEntries: [
				branchContextOutputMessageEntry("created one", { status: "success", evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: PLAN_KEY }) }),
				branchContextOutputMessageEntry("created two", { status: "success", evidence: branchContextEvidence({ branch: otherBranch, key: "plan.md" }) }),
			],
		});

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.execCalls).toEqual([]);
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain("Multiple existing branch-context candidates were found in this session.");
		expect(content).toContain("--branch <target-branch>");
		expect(content).toContain(IMPL_BRANCH);
		expect(content).toContain(otherBranch);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("branch-context:upstack-impl-session surfaces attached-plan key ambiguity on explicit reuse", async () => {
		const branch = "branch-contexts/custom-target";
		const pi = new FakePi([
			brmemListAttachedPlansStep(branch, [{ key: "alpha.md" }, { key: "beta.md" }]),
		]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler(`--branch ${branch}`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", branch, "--format", "json"] },
		]);
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain("No existing branch context with an attached plan could be reused.");
		expect(content).toContain("Branch-context key `plan.md` is absent.");
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("branch-context:upstack-impl-session falls through to the current branch when the session candidate fails verification", async () => {
		const currentBranch = "branch-contexts/current-target";
		const pi = new FakePi([
			brmemListAttachedPlansStep(IMPL_BRANCH, []),
			gitCurrentBranchStep(currentBranch),
			brmemListAttachedPlansStep(currentBranch, [{ key: PLAN_KEY }]),
			gitCheckoutStep(currentBranch),
		]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext([], {
			sessionEntries: [
				branchContextOutputMessageEntry("Created branch context and attached plan.", {
					status: "success",
					evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: PLAN_KEY }),
				}),
			],
		});

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", IMPL_BRANCH, "--format", "json"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "brmem", args: ["check", PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", currentBranch, "--format", "json"] },
			{ command: "git", args: ["checkout", currentBranch] },
		]);
		expect(pi.sentMessages[0]?.content).toContain("Reusing existing branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain("Reuse source: current branch");
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
	});

	test("branch-context:upstack-impl-session aggregates session and current-branch failures into one error", async () => {
		const pi = new FakePi([
			brmemListAttachedPlansStep(IMPL_BRANCH, []),
			gitCurrentBranchStep(SOURCE_BRANCH, { stdout: "" }),
		]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext([], {
			sessionEntries: [
				branchContextOutputMessageEntry("Created branch context and attached plan.", {
					status: "success",
					evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: PLAN_KEY }),
				}),
			],
		});

		await command?.handler("", context.ctx);

		pi.assertDone();
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain("Original saved-plan resolution failure:");
		expect(content).toContain("No existing branch context with an attached plan could be reused.");
		expect(content).toContain(`Branch-context key \`${PLAN_KEY}\` is absent.`);
		expect(content).toContain("could not resolve current branch:");
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("branch-context:upstack-impl-session resumes when the plan store directory exists but holds no plans", async () => {
		const explicitBranch = "branch-contexts/explicit-target";
		const pi = new FakePi([brmemListAttachedPlansStep(explicitBranch, [{ key: PLAN_KEY }]), gitCheckoutStep(explicitBranch)]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw emptyPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler(`--branch ${explicitBranch}`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Reusing existing branch context and attached plan.");
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
	});

	test("branch-context:upstack-impl-session reports created-path cancellation with manual recovery", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext([], { shouldCancelNewSession: true });

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		const content = pi.sentMessages.at(-1)?.content ?? "";
		expect(content).toContain(
			`Created branch context, attached the plan, and checked out ${PLAN_SLUG}, but starting the implementation session was cancelled. Run ${DEFAULT_IMPL_COMMAND} to continue.`,
		);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("branch-context:upstack-impl-session reports keyed cancellation recovery", async () => {
		const pi = new FakePi([
			step("brmem", ["check", CUSTOM_PLAN_KEY, "--namespace", BRANCH_CONTEXT_NAMESPACE, "--branch", IMPL_BRANCH, "--format", "json"], { code: 0 }),
			gitCheckoutStep(IMPL_BRANCH),
		]);
		const fakes = createBranchContextOperationFakes({
			async resolveSelectedSavedPlanFile() {
				throw missingPlanStoreError();
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext([], {
			sessionEntries: [
				branchContextOutputMessageEntry("Created branch context and attached custom plan.", {
					status: "success",
					evidence: branchContextEvidence({ branch: IMPL_BRANCH, key: CUSTOM_PLAN_KEY }),
				}),
			],
			shouldCancelNewSession: true,
		});

		await command?.handler("--yes", context.ctx);

		pi.assertDone();
		const content = pi.sentMessages.at(-1)?.content ?? "";
		expect(content).toContain(
			`Reused existing branch context, verified the attached plan, and checked out ${IMPL_BRANCH}, but starting the implementation session was cancelled. Run ${CUSTOM_IMPL_COMMAND} to continue.`,
		);
		expect(context.replacementUserMessages).toEqual([]);
	});

	test("branch-context:upstack-impl-session dry-run defaults to Graphite even when the extension option says plain Git", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		registerBranchContextExtension(pi, { branchContextDefaultCreation: "plain-git" });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler(`${filePath} --dry-run`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch would be created");
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
		expect(pi.sentMessages[0]?.content).toContain(`git checkout ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).not.toContain("gt up");
		expect(pi.sentMessages[0]?.content).toContain("/new");
		expect(pi.sentMessages[0]?.content).toContain(DEFAULT_IMPL_COMMAND);
	});

	test("branch-context:upstack-impl-session surfaces create failures before checkout", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes({
			async createBranchContextFromFile() {
				throw new Error(
					[
						"Current branch is not tracked by Graphite; refusing to stack a branch context on it.",
						`Parent branch: ${SOURCE_BRANCH}`,
						"No branch was created and no plan was attached.",
					].join("\n"),
				);
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain("Failed to create branch context and attach the plan.");
		expect(content).toContain("Current branch is not tracked by Graphite; refusing to stack a branch context on it.");
		expect(content).toContain(`Parent branch: ${SOURCE_BRANCH}`);
		expect(content).toContain("No branch was created and no plan was attached.");
		expect(context.replacementUserMessages).toEqual([]);
		expect(context.newSessionParentSessions).toEqual([]);
	});

	test("branch-context:upstack-impl-session supports plain Git creation before checkout", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("branch-context:upstack-impl-session");
		const context = createContext();

		await command?.handler(`${filePath} --yes --plain-git`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchCreation: "plain-git" });
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({ command: "git", args: ["checkout", PLAN_SLUG] });
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([DEFAULT_IMPL_COMMAND]);
	});

	test("branch-context:from-plan --plain-git override keeps the slug branch under the Graphite default", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --yes --plain-git`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchCreation: "plain-git" });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("branch-context:from-plan branchContextPrefix remains opt-in", async () => {
		const filePath = await makeNamedPlanFile();
		const prefixedBranch = `branch-contexts/${PLAN_SLUG}`;
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextPrefix: "branch-contexts/",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchName: prefixedBranch, branchCreation: "graphite" });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${prefixedBranch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("branch-context:from-plan passes explicit target branch while keeping key from slug", async () => {
		const filePath = await makeNamedPlanFile();
		const branch = "branch-contexts/custom-target";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextPrefix: "branch-contexts/", branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --yes --branch ${branch}`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchName: branch, filePath });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${branch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
	});

	test("branch-context:from-plan accepts invalid filename stems up to model slug generation", async () => {
		const filePath = await makeNamedPlanFile("bad.md");
		const contentSlug = "add-docs-portal-site";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, contentSlug)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
		expect(pi.sentMessages[0]?.content).toContain("Saved-plan file stem: bad");
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
	});

	test("branch-context:from-plan fails when model slug generation fails without fallback", async () => {
		const filePath = await makeNamedPlanFile("where-would-we-host-mossy-lampson.md");
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, PLAN_SLUG, { code: 1, stderr: "model unavailable" })]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["pi"]);
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(false);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Failed to resolve saved plan file or derive branch slug.");
		expect(pi.sentMessages[0]?.content).toContain("Failed to derive branch-context slug from plan content.");
		expect(pi.sentMessages[0]?.content).toContain("No filename or deterministic fallback was attempted.");
	});

	test("branch-context:from-plan rejects relative explicit paths before primitive mutation", async () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler("relative-source-plan.md --yes", createContext().ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Plan file path must be absolute or home-relative");
	});

	test("branch-context:from-plan surfaces operation failures without retrying", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes({
			async createBranchContextFromFile() {
				throw new Error("git check-ref-format failed");
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toHaveLength(1);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Failed to create branch context and attach the plan.");
		expect(pi.sentMessages[0]?.content).toContain("git check-ref-format failed");
	});
});

