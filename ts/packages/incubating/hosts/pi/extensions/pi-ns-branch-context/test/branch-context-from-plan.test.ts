import { describe, expect, test } from "vitest";
import registerBranchContextExtension, { CREATE_BRANCH_CONTEXT_USAGE } from "../src/extension.ts";

import {
	DEFAULT_PLAN_CONTENT,
	FakePi,
	PLAN_KEY,
	PLAN_SLUG,
	branchContextExtensionTestOptions,
	createBranchContextOperationFakes,
	createContext,
	gitCurrentBranchStep,
	gitOriginStep,
	gitRootStep,
	makeNamedPlanFile,
	makeStoredPlanFile,
	makeTempDir,
	planSlugExecCall,
	planSlugStep,
	planStoreDirectory,
	savedPlanFileContent,
	writePlanStoreFile,
} from "./branch-context-extension-support.ts";

function registerFromPlanTestExtension(
	pi: FakePi,
	options: NonNullable<Parameters<typeof registerBranchContextExtension>[1]> = {},
): void {
	registerBranchContextExtension(pi, {
		shouldResolveTargetBranchInPreview: false,
		...options,
	});
}

describe("branch-context-from-plan", () => {
	test("ns:branch-context:from-plan help displays usage without mutation", async () => {
		const pi = new FakePi();
		registerFromPlanTestExtension(pi);
		const command = pi.commands.get("ns:branch-context:from-plan");
		const context = createContext();

		await command?.handler("--help", context.ctx);

		expect(context.waits()).toBe(1);
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(CREATE_BRANCH_CONTEXT_USAGE);
	});

	test("ns:branch-context:from-plan dry-run resolves latest local plan store without mutating", async () => {
		const planStoreRoot = await makeTempDir("source-plan-store-");
		const sourceBranch = "main";
		const directoryPath = planStoreDirectory(planStoreRoot, sourceBranch);
		const timestampedFileName = `${PLAN_SLUG}--26-03-19T12-00-00--1.md`;
		const filePath = await writePlanStoreFile(
			directoryPath,
			timestampedFileName,
			1_800_000_000_000,
		);
		const pi = new FakePi([
			gitRootStep(),
			gitCurrentBranchStep(sourceBranch),
			gitOriginStep(),
			planSlugStep(savedPlanFileContent(timestampedFileName)),
		]);
		registerFromPlanTestExtension(pi, { planStoreRoot });
		const command = pi.commands.get("ns:branch-context:from-plan");
		const context = createContext();

		await command?.handler("--dry-run", context.ctx);

		pi.assertDone();
		expect(
			pi.execCalls.map((call) => ({
				command: call.command,
				args: call.args,
			})),
		).toEqual([
			{ command: "git", args: ["rev-parse", "--show-toplevel"] },
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["config", "--get", "remote.origin.url"] },
			planSlugExecCall(savedPlanFileContent(timestampedFileName)),
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(
			"Dry run: no branch was created and no plan was attached.",
		);
		expect(pi.sentMessages[0]?.content).toContain(`Path: ${filePath}`);
		expect(pi.sentMessages[0]?.content).toContain(
			`Saved-plan file stem: ${timestampedFileName.slice(0, -3)}`,
		);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
		expect(context.statuses.at(-1)).toEqual({
			key: "ns:branch-context:from-plan",
			value: undefined,
		});
	});

	test("ns:branch-context:from-plan explicit path dry-run uses a content-derived slug instead of the filename", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const contentSlug = "add-docs-portal-site";
		const content = "# Add Docs Portal Site\n\nBuild the docs portal and deploy it.\n";
		const { filePath, planStoreRoot } = await makeStoredPlanFile(
			`${savedPlanStem}--26-03-19T12-00-00--1.md`,
			content,
		);

		for (const rawPath of [filePath, `@${filePath}`]) {
			const pi = new FakePi([
				gitCurrentBranchStep(),
				gitOriginStep(),
				planSlugStep(content, contentSlug),
			]);
			registerFromPlanTestExtension(pi, { planStoreRoot });
			const command = pi.commands.get("ns:branch-context:from-plan");

			await command?.handler(`--dry-run ${rawPath}`, createContext().ctx);

			pi.assertDone();
			expect(
				pi.execCalls.map((call) => ({
					command: call.command,
					args: call.args,
				})),
			).toEqual([
				{ command: "git", args: ["branch", "--show-current"] },
				{ command: "git", args: ["config", "--get", "remote.origin.url"] },
				planSlugExecCall(content),
			]);
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

	test("ns:branch-context:from-plan dry-run repairs overlong model slug output", async () => {
		const { filePath, planStoreRoot } = await makeStoredPlanFile();
		const rawOutput = "sdl portal pages slot page conventions skeleton theme foundation\n";
		const repairedSlug = "sdl-portal-pages-slot-page-conventions-skeleton";
		const pi = new FakePi([
			gitCurrentBranchStep(),
			gitOriginStep(),
			planSlugStep(DEFAULT_PLAN_CONTENT, repairedSlug, { stdout: rawOutput }),
		]);
		registerFromPlanTestExtension(pi, { planStoreRoot });
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["git", "git", "pi"]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${repairedSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${repairedSlug}.md`);
	});

	test("ns:branch-context:from-plan creates without interactive confirmation", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)], events);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("ns:branch-context:from-plan");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			slug: PLAN_SLUG,
			filePath,
			creation: { type: "plain-git-current-head" },
		});
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
	});

	test("ns:branch-context:from-plan surfaces target branch collision without prompting", async () => {
		const filePath = await makeNamedPlanFile();
		const events: string[] = [];
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)], events);
		const fakes = createBranchContextOperationFakes({
			async createBranchContextFromFile() {
				throw new Error("Target branch already exists; refusing to overwrite.");
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("ns:branch-context:from-plan");
		const context = createContext(events, { confirm: async () => false });

		await command?.handler(filePath, context.ctx);

		pi.assertDone();
		expect(events).not.toContain("confirm");
		expect(fakes.createBranchCalls).toHaveLength(1);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(
			"Target branch already exists; refusing to overwrite.",
		);
	});

	test("ns:branch-context:from-plan does not pass preview-selected default suffix into create", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(
			pi,
			branchContextExtensionTestOptions(fakes.operations, [{ branch: PLAN_SLUG, key: PLAN_KEY }]),
		);
		const command = pi.commands.get("ns:branch-context:from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		const params = fakes.createBranchCalls[0]?.[1];
		expect(params).toMatchObject({
			slug: PLAN_SLUG,
			filePath,
			creation: { type: "plain-git-current-head" },
		});
		expect(params).not.toHaveProperty("branchName");
		expect(params).not.toHaveProperty("branchSelection");
	});

	test("ns:branch-context:from-plan --yes creates a plain-git branch context using the content slug when the filename differs", async () => {
		const savedPlanStem = "where-would-we-host-mossy-lampson";
		const filePath = await makeNamedPlanFile(`${savedPlanStem}.md`);
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("ns:branch-context:from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --yes`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			slug: PLAN_SLUG,
			filePath,
			creation: { type: "plain-git-current-head" },
		});
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain("Created branch context and attached plan.");
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Branch: ${savedPlanStem}`);
		expect(pi.sentMessages[0]?.content).not.toContain(`Key: ${savedPlanStem}.md`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("ns:branch-context:from-plan --graphite uses Graphite branch creation", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("ns:branch-context:from-plan");
		const context = createContext();

		await command?.handler(`${filePath} --yes --graphite`, context.ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			slug: PLAN_SLUG,
			filePath,
			creation: { type: "graphite-current-parent-current-head" },
		});
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("ns:branch-context:from-plan extension options default to Graphite without a branch prefix", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			creation: { type: "graphite-current-parent-current-head" },
		});
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("ns:branch-context:from-plan --plain-git override keeps the slug branch under the Graphite default", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --yes --plain-git`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			creation: { type: "plain-git-current-head" },
		});
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${PLAN_SLUG}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: plain-git");
	});

	test("ns:branch-context:from-plan branchContextPrefix remains opt-in", async () => {
		const filePath = await makeNamedPlanFile();
		const prefixedBranch = `branch-contexts/${PLAN_SLUG}`;
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextDefaultCreation: "graphite",
			branchContextPrefix: "branch-contexts/",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			branchName: prefixedBranch,
			creation: { type: "graphite-current-parent-current-head" },
		});
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${prefixedBranch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
		expect(pi.sentMessages[0]?.content).toContain("Branch creation: graphite");
	});

	test("ns:branch-context:from-plan passes explicit target branch while keeping key from slug", async () => {
		const filePath = await makeNamedPlanFile();
		const branch = "branch-contexts/custom-target";
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			branchContextPrefix: "branch-contexts/",
			branchContextOperations: fakes.operations,
		});
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --yes --branch ${branch}`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ branchName: branch, filePath });
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${branch}`);
		expect(pi.sentMessages[0]?.content).toContain(`Key: ${PLAN_KEY}`);
	});

	test("ns:branch-context:from-plan derives the slug from content instead of a different valid filename", async () => {
		const { filePath, planStoreRoot } = await makeStoredPlanFile(
			"unrelated-valid-plan--26-03-19T12-00-00--1.md",
		);
		const contentSlug = "add-docs-portal-site";
		const pi = new FakePi([
			gitCurrentBranchStep(),
			gitOriginStep(),
			planSlugStep(DEFAULT_PLAN_CONTENT, contentSlug),
		]);
		registerFromPlanTestExtension(pi, { planStoreRoot });
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --dry-run`, createContext().ctx);

		pi.assertDone();
		expect(pi.sentMessages[0]?.content).toContain("Explicit saved plan file:");
		expect(pi.sentMessages[0]?.content).toContain(
			"Saved-plan file stem: unrelated-valid-plan--26-03-19T12-00-00--1",
		);
		expect(pi.sentMessages[0]?.content).toContain(`Content-derived slug: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch: ${contentSlug}`);
		expect(pi.sentMessages[0]?.content).toContain(`Branch Memory key: ${contentSlug}.md`);
	});

	test("ns:branch-context:from-plan fails when model slug generation fails without fallback", async () => {
		const { filePath, planStoreRoot } = await makeStoredPlanFile(
			"where-would-we-host-mossy-lampson--26-03-19T12-00-00--1.md",
		);
		const pi = new FakePi([
			gitCurrentBranchStep(),
			gitOriginStep(),
			planSlugStep(DEFAULT_PLAN_CONTENT, PLAN_SLUG, { code: 1, stderr: "model unavailable" }),
		]);
		registerFromPlanTestExtension(pi, { planStoreRoot });
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(pi.execCalls.map((call) => call.command)).toEqual(["git", "git", "pi"]);
		expect(
			pi.execCalls.some(
				(call) =>
					call.command === "git" && call.args[0] === "branch" && call.args[1] !== "--show-current",
			),
		).toBe(false);
		expect(pi.execCalls.some((call) => call.command === "brmem" && call.args[0] === "put")).toBe(
			false,
		);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(
			"Failed to resolve saved plan file or derive branch slug.",
		);
		expect(pi.sentMessages[0]?.content).toContain(
			"Failed to derive branch-context slug from plan content.",
		);
		expect(pi.sentMessages[0]?.content).toContain(
			"No filename or deterministic fallback was attempted.",
		);
	});

	test("ns:branch-context:from-plan rejects relative explicit paths before primitive mutation", async () => {
		const pi = new FakePi([gitCurrentBranchStep(), gitOriginStep()]);
		registerFromPlanTestExtension(pi);
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler("relative-source-plan.md --yes", createContext().ctx);

		expect(pi.execCalls.map((call) => ({ command: call.command, args: call.args }))).toEqual([
			{ command: "git", args: ["branch", "--show-current"] },
			{ command: "git", args: ["config", "--get", "remote.origin.url"] },
		]);
		expect(pi.sentMessages[0]?.content).toContain(
			"Saved Plan path must be absolute or home-relative",
		);
	});

	test("ns:branch-context:from-plan surfaces operation failures without retrying", async () => {
		const filePath = await makeNamedPlanFile();
		const pi = new FakePi([planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes({
			async createBranchContextFromFile() {
				throw new Error("git check-ref-format failed");
			},
		});
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const command = pi.commands.get("ns:branch-context:from-plan");

		await command?.handler(`${filePath} --yes`, createContext().ctx);

		pi.assertDone();
		expect(fakes.createBranchCalls).toHaveLength(1);
		expect(
			pi.execCalls.map((call) => ({
				command: call.command,
				args: call.args,
			})),
		).toEqual([planSlugExecCall(DEFAULT_PLAN_CONTENT)]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]?.content).toContain(
			"Failed to create branch context and attach the plan.",
		);
		expect(pi.sentMessages[0]?.content).toContain("git check-ref-format failed");
	});
});
