import { describe, expect, test } from "vitest";

import {
	CREATE_PLANNED_BRANCH_USAGE,
	DEFAULT_FAST_MODEL,
	DEFAULT_PLAN_CONTENT,
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	FakePi,
	IMPL_BRANCH,
	IMPL_PLAN_CONTENT,
	IMPL_REF,
	PLAN_BRANCH_NAMESPACE,
	PLAN_KEY,
	PLAN_SLUG,
	REPO_ROOT,
	ROOT,
	SOURCE_BRANCH,
	START_POINT,
	TARGET_BRANCH,
	attachedPlan,
	buildPlanContentSlugPrompt,
	buildRepoPlanStoreKey,
	buildSavedPlanContentSlugPrompt,
	buildSlugModelArgs,
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
	contentSlugEvidence,
	createContext,
	createPlannedBranchOperationFakes,
	createToolContext,
	dirname,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	formatCreatePlannedBranchPreview,
	formatPlanBranchEvidence,
	formatSavedPlanFileEvidence,
	gitCheckoutStep,
	gitCurrentBranchStep,
	gitOriginStep,
	gitRootStep,
	homedir,
	isPathInside,
	join,
	makeNamedPlanFile,
	makeTempDir,
	mkdir,
	normalizePlanFilePath,
	normalizeRepoOriginUrl,
	parseCreatePlannedBranchArgs,
	planSlugExecCall,
	planSlugStep,
	planStoreDirectory,
	plannedBranchEvidence,
	plannedBranchOutputMessageEntry,
	readFile,
	registeredTool,
	registerPlannedBranchExtension,
	resolve,
	resolveWritePlanPromptStep,
	savedPlanFileContent,
	savedPlanSlugArgs,
	savedPlanSlugStep,
	sourcePlanEvidence,
	sourcePlanToolResultEntry,
	validatePlanSlug,
	writeFile,
	writePlanStoreFile,
	writeSavedPlanFile,
	type ToolUpdate,
} from "./planned-branch-extension-support.ts";
describe("plan workflow commands", () => {
	test("registers plans write commands, planned-branch workflow commands, and write tool", () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"planned-branch:create",
			"planned-branch:impl",
			"planned-branch:upstack-impl-session",
			"plans:grill-and-write",
			"plans:write",
		]);
		expect([...pi.commands.keys()].filter((name) => name.startsWith("plans:"))).toEqual(["plans:write", "plans:grill-and-write"]);
		expect(pi.tools.has("write_saved_plan_file")).toBe(true);
		expect([...pi.tools.keys()]).toEqual(["write_saved_plan_file"]);
	});

	test("plans:grill-and-write waits for idle and dispatches embedded prompt without prompt resolution", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:grill-and-write");
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
			{ message: "Starting /plans:grill-and-write planning grill…", level: "info" },
		]);
	});

	test("plans:grill-and-write with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:grill-and-write");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWriteGrilledPlanPrompt("")]);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("plans:write waits for idle, resolves prompt, and dispatches the generated prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([resolveWritePlanPromptStep()], events);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
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
		expect(pi.sentUserMessages[0]).toContain("~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<slug>.md");
		expect(pi.sentUserMessages[0]).toContain("completely fresh downstream implementation session");
		expect(pi.sentUserMessages[0]).toContain("External research/context contract");
		expect(pi.sentUserMessages[0]).not.toContain("create_brmem_plan_branch_from_file");
		expect(pi.sentUserMessages[0]).not.toContain("branchCreation");
		expect(context.notifications).toEqual([{ message: "Starting /plans:write planning turn…", level: "info" }]);
	});

	test("plans:write with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep()]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("plans:write uses custom resolved prompt body", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep({ content: "Custom plan body\n" })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext();

		await command?.handler("customize this", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("customize this", "Custom plan body\n")]);
		expect(context.notifications).toEqual([{ message: "Starting /plans:write planning turn…", level: "info" }]);
	});

	test("plans:write falls back and warns when resolver fails", async () => {
		const pi = new FakePi([
			resolveWritePlanPromptStep({ result: { code: 1, stdout: "", stderr: "prompt_not_found: missing" } }),
		]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext();

		await command?.handler("fallback please", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("fallback please")]);
		expect(context.notifications).toEqual([
			{ message: "Starting /plans:write planning turn…", level: "info" },
			{
				message:
					"Falling back to built-in /plans:write prompt body because asdl exec resolve-prompt failed with exit code 1: prompt_not_found: missing",
				level: "warning",
			},
		]);
	});

	test("plans:write falls back without UI warning when resolver returns malformed JSON", async () => {
		const pi = new FakePi([resolveWritePlanPromptStep({ result: { stdout: "not json" } })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("plans:write");
		const context = createContext([], { hasUI: false });

		await command?.handler("malformed", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("malformed")]);
		expect(context.notifications).toEqual([]);
	});

	test("planned-branch:impl waits, loads the attached plan, and sends an implementation prompt", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		const fakes = createPlannedBranchOperationFakes({ loadPlannedBranchPlan: async () => attachedPlan({ refName: IMPL_REF }) });
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:impl");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events[0]).toBe("wait");
		expect(pi.execCalls).toEqual([]);
		expect(fakes.loadPlanCalls).toHaveLength(1);
		expect(fakes.loadPlanCalls[0]?.[1]).toEqual({});
		expect(context.notifications).toEqual([{ message: "Loading attached planned-branch plan…", level: "info" }]);
		expect(context.statuses).toEqual([
			{ key: "planned-branch:impl", value: "loading attached plan…" },
			{ key: "planned-branch:impl", value: undefined },
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("planned-branch-output");
		expect(pi.sentMessages[0]?.content).toContain("Loaded attached planned-branch plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentMessages[0]?.content).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("The attached planned-branch plan has been loaded by the planning-layer reader.");
		expect(pi.sentUserMessages[0]).toContain(`Branch: ${IMPL_BRANCH}`);
		expect(pi.sentUserMessages[0]).toContain(`Namespace: ${PLAN_BRANCH_NAMESPACE}`);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${IMPL_REF}`);
		expect(pi.sentUserMessages[0]).toContain(`Bytes: ${new TextEncoder().encode(IMPL_PLAN_CONTENT).length}`);
		expect(pi.sentUserMessages[0]).toContain(IMPL_PLAN_CONTENT);
		expect(pi.sentUserMessages[0]).toContain("Create an implementation checklist");
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("planned-branch:impl passes a requested slug into attached-plan selection", async () => {
		const pi = new FakePi();
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:impl");
		const context = createContext();

		await command?.handler(`  ${PLAN_SLUG}  `, context.ctx);

		pi.assertDone();
		expect(fakes.loadPlanCalls[0]?.[1]).toEqual({ requestedKey: PLAN_SLUG });
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("planned-branch:impl presents saved-plan fallback evidence", async () => {
		const planContent = "# Saved Impl Plan\n\n- Implement from the saved plan.\n";
		const filePath = "/tmp/source-plan-store/branch-scoped-plan-extension.md";
		const pi = new FakePi();
		const fakes = createPlannedBranchOperationFakes({
			loadPlannedBranchPlan: async () =>
				attachedPlan({
					branch: SOURCE_BRANCH,
					namespace: "local-plan-store",
					refName: filePath,
					content: planContent,
					source: "saved",
					sourceFile: filePath,
				}),
		});
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Loaded saved planned-branch plan from local plan store.");
		expect(pi.sentMessages[0]?.content).toContain(`Selected key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("The saved planned-branch plan from the local plan store has been loaded");
		expect(pi.sentUserMessages[0]).toContain(`Namespace: local-plan-store`);
		expect(pi.sentUserMessages[0]).toContain(`Ref: ${filePath}`);
		expect(pi.sentUserMessages[0]).toContain(`----- BEGIN SAVED PLAN -----\n${planContent}\n----- END SAVED PLAN -----`);
		expect(pi.sentUserMessages[0]).not.toContain("/skill:");
	});

	test("planned-branch:impl presents load failures without sending an implementation prompt", async () => {
		const pi = new FakePi();
		const fakes = createPlannedBranchOperationFakes({
			async loadPlannedBranchPlan() {
				throw new Error("Refusing to implement directly on trunk (`main`)");
			},
		});
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:impl");
		const context = createContext();

		await command?.handler("", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.customType).toBe("planned-branch-output");
		expect(pi.sentMessages[0]?.content).toContain("Failed to load planned-branch plan.");
		expect(pi.sentMessages[0]?.content).toContain("Refusing to implement directly on trunk (`main`)");
		expect(pi.execCalls).toEqual([]);
		expect(context.statuses.at(-1)).toEqual({ key: "planned-branch:impl", value: undefined });
	});

	test("planned-branch:create help displays usage without mutation", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");
		const context = createContext();

		await command?.handler("--help", context.ctx);

		expect(context.waits()).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(CREATE_PLANNED_BRANCH_USAGE);
	});

	test("planned-branch:create dry-run resolves latest local plan store without mutating", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const filePath = await writePlanStoreFile(directoryPath, `${PLAN_KEY}`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(PLAN_KEY))]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
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
		expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(context.statuses.at(-1)).toEqual({ key: "planned-branch:create", value: undefined });
	});

	test("planned-branch:create dry-run prefers session-created plan over newer disk mtime", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionSlug = "submit-dirty-worktree-checkpoint";
		const newerDiskSlug = "harden-cp-autobranch-validation";
		const sessionKey = `${sessionSlug}.md`;
		const contentSlug = "add-session-planned-branch";
		const sessionPath = await writePlanStoreFile(directoryPath, sessionKey, 1_700_000_000_000);
		await writePlanStoreFile(directoryPath, `${newerDiskSlug}.md`, 1_800_000_000_000);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep(), planSlugStep(savedPlanFileContent(sessionKey), contentSlug)]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
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
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${contentSlug}.md`);
		expect(pi.sentMessages[0]?.content).not.toContain(`${newerDiskSlug}.md`);
	});

	test("planned-branch:create explicit path wins over session evidence", async () => {
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
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
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

	test("planned-branch:create explicit path dry-run uses a content-derived slug instead of the filename", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const contentSlug = "add-docs-portal-site";
		const content = "# Add Docs Portal Site\n\nBuild the docs portal and deploy it.\n";
		const filePath = await makeNamedPlanFile(`${savedPlanStem}.md`, content);

		for (const rawPath of [filePath, `@${filePath}`]) {
			const pi = new FakePi([planSlugStep(content, contentSlug)]);
			registerPlannedBranchExtension(pi);
			const command = pi.commands.get("planned-branch:create");

			await command?.handler(`--dry-run ${rawPath}`, createContext().ctx);

			pi.assertDone();
			expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(content)]);
			expect(pi.sentMessages).toHaveLength(1);
			expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
			expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
			expect(pi.sentMessages[0]?.content).toContain(`Saved-plan file stem: ${savedPlanStem}`);
			expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
			expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
			expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${contentSlug}.md`);
			expect(pi.sentMessages[0]?.content).not.toContain(`Branch: ${savedPlanStem}`);
		}
	});

	test("planned-branch:create dry-run repairs overlong model slug output", async () => {
		const filePath = await makeNamedPlanFile();
		const rawOutput = "asdl docs site slot page conventions skeleton theme foundation\n";
		const repairedSlug = "asdl-docs-site-slot-page-conventions-skeleton";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, repairedSlug, { stdout: rawOutput })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["pi"]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${repairedSlug}.md`);
	});

	test("planned-branch:create ignores missing session file and falls back to disk latest", async () => {
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
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
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

	test("planned-branch:create rejects wrong repo or branch session evidence", async () => {
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
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
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

	test("planned-branch:create rejects outside-plan-store session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const outsidePath = await makeNamedPlanFile(`${PLAN_KEY}`);
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], {
			sessionEntries: [sourcePlanToolResultEntry(sourcePlanEvidence({ slug: PLAN_SLUG, filePath: outsidePath, sourceBranch }))],
		});

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("outside the current local plan store directory");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("planned-branch:create rejects wrong branch key even when source branch matches", async () => {
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
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(wrongBranchKeyEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("branchKey");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("planned-branch:create rejects basename and slug mismatch in session evidence", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const sessionPath = await writePlanStoreFile(directoryPath, `${PLAN_SLUG}.md`, 1_700_000_000_000);
		const mismatchEvidence = sourcePlanEvidence({ slug: "submit-dirty-worktree-checkpoint", filePath: sessionPath, sourceBranch });
		const pi = new FakePi([gitRootStep(), gitCurrentBranchStep(sourceBranch), gitOriginStep()]);
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], { sessionEntries: [sourcePlanToolResultEntry(mismatchEvidence)] });

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("basename must match slug");
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem")).toBe(false);
	});

	test("planned-branch:create ignores stale cancellation output while using tool result evidence", async () => {
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
		registerPlannedBranchExtension(pi, { planStoreRoot });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext([], {
			sessionEntries: [
				sourcePlanToolResultEntry(sourcePlanEvidence({ slug: sessionSlug, filePath: sessionPath, sourceBranch })),
				plannedBranchOutputMessageEntry(
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

	test("planned-branch:create creates without interactive confirmation", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)], events);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "plain-git" });
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
	});

	test("planned-branch:create surfaces target branch collision without prompting", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)], events);
		const fakes = createPlannedBranchOperationFakes({
			async createPlannedBranchFromFile() {
				throw new Error("Target branch already exists; refusing to overwrite.");
			},
		});
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(fakes.createBranchCalls).toHaveLength(1);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Target branch already exists; refusing to overwrite.");
	});

	test("planned-branch:create --yes creates a plain-git planned branch using the content slug when the filename differs", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const filePath = await makeNamedPlanFile(`${savedPlanStem}.md`);
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "plain-git" });
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Branch: ${savedPlanStem}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Key: ${savedPlanStem}.md`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("planned-branch:create --graphite uses Graphite branch creation", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:create");
		const context = createContext();

		await command?.handler(`${filePath} --yes --graphite`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "graphite" });
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("planned-branch:create extension options default to Graphite without a branch prefix", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
			plannedBranchOperations: fakes.operations,
		});
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchCreation: "graphite" });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("planned-branch:upstack-impl-session creates with Graphite, checks out the branch, and dispatches impl in a new session", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)], events);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:upstack-impl-session");
		const context = createContext(events, { sessionFile: "/sessions/source.jsonl" });

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ slug: PLAN_SLUG, filePath, branchCreation: "graphite" });
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			planSlugExecCall(DEFAULT_PLAN_CONTENT),
			{ command: "git", args: ["checkout", PLAN_SLUG] },
		]);
		expect(pi.sentMessages[0]?.content).toContain("Created planned branch and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([`/planned-branch:impl ${PLAN_KEY}`]);
		expect(context.newSessionParentSessions).toEqual(["/sessions/source.jsonl"]);
		expect(events.indexOf("new-session")).toBeGreaterThan(events.indexOf("status"));
		expect(events.indexOf("replacement-send")).toBeGreaterThan(events.indexOf("new-session"));
		expect(context.statuses.at(-1)).toEqual({ key: "planned-branch:upstack-impl-session", value: undefined });
	});

	test("planned-branch:upstack-impl-session dry-run defaults to Graphite even when the extension option says plain Git", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		registerPlannedBranchExtension(pi, { plannedBranchDefaultCreation: "plain-git" });
		const command = pi.commands.get("planned-branch:upstack-impl-session");
		const context = createContext();

		await command?.handler(`${filePath} --dry-run`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		expect(pi.sentMessages[0]?.content).toContain("Dry run: no branch was created");
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
		expect(pi.sentMessages[0]?.content).toContain(`git checkout ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).not.toContain("gt up");
		expect(pi.sentMessages[0]?.content).toContain("/new");
		expect(pi.sentMessages[0]?.content).toContain(`/planned-branch:impl ${PLAN_KEY}`);
	});

	test("planned-branch:upstack-impl-session surfaces create failures before checkout", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes({
			async createPlannedBranchFromFile() {
				throw new Error(
					[
						"Current branch is not tracked by Graphite; refusing to stack a planned branch on it.",
						`Parent branch: ${SOURCE_BRANCH}`,
						"No branch was created and no plan was attached.",
					].join("\n"),
				);
			},
		});
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:upstack-impl-session");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		const content = pi.sentMessages[0]?.content ?? "";
		expect(content).toContain("Failed to create planned branch and attach the plan.");
		expect(content).toContain("Current branch is not tracked by Graphite; refusing to stack a planned branch on it.");
		expect(content).toContain(`Parent branch: ${SOURCE_BRANCH}`);
		expect(content).toContain("No branch was created and no plan was attached.");
		expect(context.replacementUserMessages).toEqual([]);
		expect(context.newSessionParentSessions).toEqual([]);
	});

	test("planned-branch:upstack-impl-session supports plain Git creation before checkout", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT), gitCheckoutStep(PLAN_SLUG)]);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
			plannedBranchOperations: fakes.operations,
		});
		const command = pi.commands.get("planned-branch:upstack-impl-session");
		const context = createContext();

		await command?.handler(`${filePath} --yes --plain-git`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchCreation: "plain-git" });
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toContainEqual({ command: "git", args: ["checkout", PLAN_SLUG] });
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(pi.sentUserMessages).toEqual([]);
		expect(context.replacementUserMessages).toEqual([`/planned-branch:impl ${PLAN_KEY}`]);
	});

	test("planned-branch:create --plain-git override keeps the slug branch under the Graphite default", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
			plannedBranchOperations: fakes.operations,
		});
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes --plain-git`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchCreation: "plain-git" });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("planned-branch:create plannedBranchPrefix remains opt-in", async () => {
		const filePath = await makeNamedPlanFile();
		const prefixedBranch = `planned-branches/${PLAN_SLUG}`;
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, {
			plannedBranchDefaultCreation: "graphite",
			plannedBranchPrefix: "planned-branches/",
			plannedBranchOperations: fakes.operations,
		});
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchName: prefixedBranch, branchCreation: "graphite" });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${prefixedBranch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("planned-branch:create passes explicit target branch while keeping key from slug", async () => {
		const filePath = await makeNamedPlanFile();
		const branch = "planned-branches/custom-target";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes();
		registerPlannedBranchExtension(pi, { plannedBranchPrefix: "planned-branches/", plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes --branch ${branch}`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchName: branch, filePath });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${branch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
	});

	test("planned-branch:create accepts invalid filename stems up to model slug generation", async () => {
		const filePath = await makeNamedPlanFile("bad.md");
		const contentSlug = "add-docs-portal-site";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, contentSlug)]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
		expect(pi.sentMessages[0]?.content).toContain("Saved-plan file stem: bad");
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${contentSlug}.md`);
	});

	test("planned-branch:create fails when model slug generation fails without fallback", async () => {
		const filePath = await makeNamedPlanFile("where-would-we-host-mossy-lampson.md");
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT, PLAN_SLUG, { code: 1, stderr: "model unavailable" })]);
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["pi"]);
		expect(pi.execCalls.some((call) => call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current")).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(false);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Failed to resolve saved plan file or derive branch slug.");
		expect(pi.sentMessages[0]?.content).toContain("Failed to derive planned-branch slug from plan content.");
		expect(pi.sentMessages[0]?.content).toContain("No filename or deterministic fallback was attempted.");
	});

	test("planned-branch:create rejects relative explicit paths before primitive mutation", async () => {
		const pi = new FakePi();
		registerPlannedBranchExtension(pi);
		const command = pi.commands.get("planned-branch:create");

		await command?.handler("relative-source-plan.md --yes", createContext().ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Plan file path must be absolute or home-relative");
	});

	test("planned-branch:create surfaces operation failures without retrying", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createPlannedBranchOperationFakes({
			async createPlannedBranchFromFile() {
				throw new Error("git check-ref-format failed");
			},
		});
		registerPlannedBranchExtension(pi, { plannedBranchOperations: fakes.operations });
		const command = pi.commands.get("planned-branch:create");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toHaveLength(1);
		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Failed to create planned branch and attach the plan.");
		expect(pi.sentMessages[0]?.content).toContain("git check-ref-format failed");
	});
});

