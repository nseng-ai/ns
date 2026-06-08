import type { LoadedAttachedPlan } from "@asdl/planned-branch";
import { renderTsPlanRecipeImplementationInstructionsFromContent } from "@asdl/ts-plans/host";

export async function buildImplTsPlannedBranchPrompt(
	plan: LoadedAttachedPlan,
	options: { cwd: string; signal?: AbortSignal | undefined },
): Promise<string> {
	const rendered = await renderTsPlanRecipeImplementationInstructionsFromContent(plan.content, {
		key: plan.selectedKey,
		cwd: options.cwd,
		signal: options.signal,
	});
	if (rendered.type === "failure") {
		throw new Error(rendered.message);
	}

	return [
		"# planned-branch TypeScript recipe implementation",
		"",
		"The attached planned-branch TypeScript recipe has been loaded and evaluated by Pi into these implementation instructions.",
		"Treat the `.plan.ts` source as the source of truth. If the rendered prompt and source conflict, inspect the source and ask before proceeding.",
		"The trusted recipe runtime records instructions; `validateWithShell` records validation commands and does not execute them during recipe evaluation.",
		"",
		"## Loaded recipe source",
		"",
		`Branch: ${plan.branch}`,
		`Namespace: ${plan.namespace}`,
		`Selected key: ${plan.selectedKey}`,
		`Ref: ${plan.refName}`,
		`Bytes: ${plan.byteCount}`,
		`Source: ${plan.source}`,
		plan.sourceFile === undefined ? undefined : `Source file: ${plan.sourceFile}`,
		"",
		"## Rendered recipe instructions",
		"",
		rendered.instructions,
	].filter((line): line is string => line !== undefined).join("\n");
}
