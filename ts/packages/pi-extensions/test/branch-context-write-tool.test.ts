import { describe, expect, test } from "vitest";

import {
	CREATE_BRANCH_CONTEXT_USAGE,
	DEFAULT_FAST_MODEL,
	DEFAULT_PLAN_CONTENT,
	DEFAULT_WRITE_PLAN_PROMPT_BODY,
	FakePi,
	IMPL_BRANCH,
	IMPL_PLAN_CONTENT,
	IMPL_REF,
	BRANCH_CONTEXT_NAMESPACE,
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
	createBranchContextOperationFakes,
	createToolContext,
	dirname,
	encodeBranchForPlanPath,
	findLatestSavedPlanFile,
	formatCreateBranchContextPreview,
	formatBranchContextEvidence,
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
	parseCreateBranchContextArgs,
	planSlugExecCall,
	planSlugStep,
	planStoreDirectory,
	branchContextEvidence,
	branchContextOutputMessageEntry,
	readFile,
	registeredTool,
	registerBranchContextExtension,
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
} from "./branch-context-extension-support.ts";
describe("write_saved_plan_file tool", () => {
	test("describes the local plan store contract and strict parameters", () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const parameters = tool.parameters as {
			properties?: Record<string, unknown>;
			required?: string[];
			additionalProperties?: boolean;
		};

		expect(tool.description).toContain("~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md");
		expect(tool.description).toContain("refuses to overwrite");
		expect(tool.description).toContain("does not create branches or write Branch Memory");
		expect(tool.description).toContain("self-contained");
		expect(tool.description).toContain("Codex-backed slug model");
		expect(tool.promptSnippet).toContain("local plan store");
		expect(tool.promptSnippet).toContain("self-contained");
		expect(tool.promptGuidelines?.join("\n")).toContain("/enriched-plan:save");
		expect(tool.promptGuidelines?.join("\n")).toContain("/enriched-plan:grill-and-save");
		expect(tool.promptGuidelines?.join("\n")).toContain("Do not generate or pass");
		expect(tool.promptGuidelines?.join("\n")).toContain("fresh downstream implementation session");
		expect(tool.promptGuidelines?.join("\n")).toContain("external/off-repo research");
		const contentParameter = parameters.properties?.content as { description?: string } | undefined;
		expect(contentParameter?.description).toContain("self-contained");
		expect(contentParameter?.description).toContain("external research");
		expect(parameters.required).toEqual(["content"]);
		expect(parameters.additionalProperties).toBe(false);
		expect(Object.keys(parameters.properties ?? {})).toEqual(["content", "summary"]);
	});

	test("derives the saved-plan filename slug with the Codex slug model before writing", async () => {
		const content = "# Branch Scoped Plan Extension\n\nPersist saved plans from final content.\n";
		const pi = new FakePi([savedPlanSlugStep(content)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const tool = registeredTool(pi, "write_saved_plan_file");

		const result = await tool.execute(
			"tool-call",
			{ content, summary: "Plan the local plan store file." },
			undefined,
			undefined,
			{ cwd: ROOT },
		);

		pi.assertDone();
		expect(pi.execCalls[0]?.command).toBe("pi");
		expect(pi.execCalls[0]?.args).toEqual(savedPlanSlugArgs(content));
		expect(pi.execCalls[0]?.options).toMatchObject({ cwd: ROOT, timeout: 60_000 });
		expect(fakes.writePlanCalls[0]?.[1]).toEqual({ slug: PLAN_SLUG, content, summary: "Plan the local plan store file." });
		expect(fakes.writePlanCalls[0]?.[2]).toMatchObject({ cwd: ROOT });
		expect(result.content[0]?.text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(result.content[0]?.text).toContain(`Slug model: ${DEFAULT_FAST_MODEL.provider}/${DEFAULT_FAST_MODEL.modelId}`);
		expect(result.details).toMatchObject({
			slug: PLAN_SLUG,
			filePath: `/tmp/${PLAN_SLUG}.md`,
			slugEvidence: contentSlugEvidence(),
		});
	});

	test("streams progress while deriving the saved-plan slug and writing the plan file", async () => {
		const content = "# Branch Scoped Plan Extension\n\nPersist saved plans from final content.\n";
		const pi = new FakePi([savedPlanSlugStep(content)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, { branchContextOperations: fakes.operations });
		const tool = registeredTool(pi, "write_saved_plan_file");
		const updates: ToolUpdate[] = [];
		const toolContext = createToolContext({ hasUI: true });

		const result = await tool.execute(
			"tool-call",
			{ content, summary: "Plan the local plan store file." },
			undefined,
			(update) => updates.push(update),
			toolContext.ctx,
		);

		const updateTexts = updates.flatMap((update) => update.content ?? []).map((item) => item.text);
		const validationIndex = updateTexts.findIndex((text) => text.includes("Validating saved plan input"));
		const slugIndex = updateTexts.findIndex((text) => text.includes("Deriving saved-plan filename slug with Codex"));
		const writingIndex = updateTexts.findIndex((text) => text.includes("Writing plan file"));

		pi.assertDone();
		expect(validationIndex).toBeGreaterThan(-1);
		expect(slugIndex).toBeGreaterThan(validationIndex);
		expect(writingIndex).toBeGreaterThan(slugIndex);
		expect(updateTexts.join("\n")).toContain(PLAN_SLUG);
		expect(updates.map((update) => update.details)).toContainEqual({ phase: "validating" });
		expect(updates.map((update) => update.details)).toContainEqual({ phase: "deriving-slug" });
		expect(updates.map((update) => update.details)).toContainEqual({ phase: "writing-file", slug: PLAN_SLUG });
		expect(toolContext.statuses).toContainEqual({ key: "enriched-plan:save", value: "Validating saved plan input…" });
		expect(toolContext.statuses).toContainEqual({ key: "enriched-plan:save", value: "Deriving saved-plan filename slug with Codex…" });
		expect(toolContext.statuses).toContainEqual({
			key: "enriched-plan:save",
			value: `Derived slug ${PLAN_SLUG}; resolving repo/branch and writing plan file…`,
		});
		expect(toolContext.statuses).toContainEqual({ key: "enriched-plan:save", value: "Writing plan file…" });
		expect(toolContext.statuses.at(-1)).toEqual({ key: "enriched-plan:save", value: undefined });
		expect(result.content[0]?.text).toContain(`Slug: ${PLAN_SLUG}`);
		expect(result.content[0]?.text).toContain(`Slug model: ${DEFAULT_FAST_MODEL.provider}/${DEFAULT_FAST_MODEL.modelId}`);
		expect(fakes.writePlanCalls[0]?.[1]).toEqual({ slug: PLAN_SLUG, content, summary: "Plan the local plan store file." });
		expect(result.details).toMatchObject({
			slug: PLAN_SLUG,
			filePath: `/tmp/${PLAN_SLUG}.md`,
			slugEvidence: contentSlugEvidence(),
		});
	});

	test("rejects assistant-provided saved-plan slugs so /enriched-plan:save cannot bypass Codex slugging", async () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");

		await expect(
			tool.execute("tool-call", { slug: PLAN_SLUG, content: DEFAULT_PLAN_CONTENT }, undefined, undefined, { cwd: ROOT }),
		).rejects.toThrow("derives `slug` from content through Codex");
		expect(pi.execCalls).toEqual([]);
	});

	test("clears write-plan status when validation fails", async () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const toolContext = createToolContext({ hasUI: true });

		await expect(tool.execute("tool-call", { content: 42 }, undefined, undefined, toolContext.ctx)).rejects.toThrow(
			"requires string parameter `content`",
		);

		expect(pi.execCalls).toEqual([]);
		expect(toolContext.statuses).toEqual([
			{ key: "enriched-plan:save", value: "Validating saved plan input…" },
			{ key: "enriched-plan:save", value: undefined },
		]);
	});

	test("renders tool-call argument streaming progress without dumping plan content", () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const renderCall = tool.renderCall;

		expect(renderCall).toBeDefined();
		if (renderCall === undefined) {
			throw new Error("write_saved_plan_file renderCall was not registered");
		}

		const distinctivePlanBody = "SECRET_PLAN_BODY_SHOULD_NOT_RENDER";
		const content = `# Plan\n\n${distinctivePlanBody}\n\n${"Details ".repeat(1_800)}`;
		const missingContent = renderCall({}, undefined, { executionStarted: false, argsComplete: false });
		const receivingContent = renderCall({ content }, undefined, { executionStarted: false, argsComplete: false });
		const savingContent = renderCall({ content }, undefined, { executionStarted: true, argsComplete: true });

		const missingText = missingContent.render(100).join("\n");
		const receivingText = receivingContent.render(100).join("\n");
		const savingText = savingContent.render(100).join("\n");

		expect(missingText).toContain("write_saved_plan_file");
		expect(missingText).toContain("receiving saved-plan content from model");
		expect(receivingText).toContain("receiving saved-plan content from model");
		expect(receivingText).toMatch(/\d+(?:\.\d)?k tokens \(est\.\)/);
		expect(receivingText).not.toContain("chars");
		expect(receivingText).not.toContain(distinctivePlanBody);
		expect(savingText).toContain("saving reviewed plan");
		expect(savingText).toMatch(/\d+(?:\.\d)?k tokens \(est\.\)/);
		expect(savingText).not.toContain("chars");
		expect(savingText).not.toContain(distinctivePlanBody);
	});

	test("renders partial write-plan progress with an in-progress heading", () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const tool = registeredTool(pi, "write_saved_plan_file");
		const renderResult = tool.renderResult;

		expect(renderResult).toBeDefined();
		if (renderResult === undefined) {
			throw new Error("write_saved_plan_file renderResult was not registered");
		}

		const partial = renderResult(
			{ content: [{ type: "text", text: "Deriving saved-plan filename slug with Codex…" }] },
			{ isPartial: true },
			undefined,
			undefined,
		);
		const final = renderResult({ content: [{ type: "text", text: "Path: /tmp/plan.md" }] }, { isPartial: false }, undefined, undefined);

		expect(partial.render(100).join("\n")).toContain("Saving branch-context plan…");
		expect(partial.render(100).join("\n")).toContain("Deriving saved-plan filename slug with Codex…");
		expect(final.render(100).join("\n").trimEnd()).toBe("Path: /tmp/plan.md");
	});
});

