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
describe("branch-context-upstack-impl-session", () => {
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
});
