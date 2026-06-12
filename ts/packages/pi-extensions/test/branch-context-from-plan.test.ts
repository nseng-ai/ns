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
describe("branch-context-from-plan", () => {
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
