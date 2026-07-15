import {
	finalizeBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "@nseng-ai/foundation/branch-slug";
import {
	formatRawTextModelFailure,
	generateRawTextWithModel,
} from "@nseng-ai/capability-kit/model-slug";
import type { CommandExecApi } from "@nseng-ai/foundation/command";
import {
	MODEL_OPERATION_IDS,
	loadModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import { nodeProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import type { TextResult } from "@nseng-ai/foundation/primitives";

export { finalizeBranchSlug, MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName, trimBranchSlugToLength };

const MAX_SLUG_INPUT_CHARS = 12_000;
const MAX_SUMMARY_INPUT_CHARS = 16_000;

export type BranchSlugContentKind = "task" | "plan";

type BranchSlugRuntime = CommandExecApi;

export async function generateBranchSlug(
	pi: BranchSlugRuntime,
	cwd: string,
	input: {
		kind: BranchSlugContentKind;
		content: string;
		sourceLabel?: string;
		fallbackText?: string;
	},
): Promise<TextResult> {
	const prompt = buildSlugPrompt(input);
	const policy = loadModelPolicy({ repoRoot: cwd, gateway: nodeProjectConfigGateway });
	if (!policy.ok)
		return { ok: false, message: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
	if (!model.ok)
		return { ok: false, message: `Invalid model policy in ns.toml: ${model.error.message}` };
	const result = await generateRawText(pi, cwd, prompt, model.value.modelRef);
	if (!result.ok) {
		return {
			ok: false,
			message: `Could not generate branch slug with the configured fast model: ${result.message}`,
		};
	}

	const slug =
		sanitizeBranchName(result.text) || sanitizeBranchName(input.fallbackText ?? input.content);
	if (!slug) {
		return { ok: false, message: "Could not derive a usable branch slug." };
	}

	return { ok: true, text: slug };
}

export async function summarizePlanWithGptNano(
	pi: BranchSlugRuntime,
	cwd: string,
	input: {
		content: string;
		sourceLabel?: string;
	},
): Promise<TextResult> {
	const policy = loadModelPolicy({ repoRoot: cwd, gateway: nodeProjectConfigGateway });
	if (!policy.ok)
		return { ok: false, message: `Invalid model policy in ns.toml: ${policy.error.message}` };
	const model = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
	if (!model.ok)
		return { ok: false, message: `Invalid model policy in ns.toml: ${model.error.message}` };
	const result = await generateRawText(
		pi,
		cwd,
		buildPlanSummaryPrompt(input),
		model.value.modelRef,
	);
	if (!result.ok) {
		return {
			ok: false,
			message: `Could not summarize plan with the configured fast model: ${result.message}`,
		};
	}

	const summary = stripResponseFence(result.text).trim();
	if (!summary) {
		return {
			ok: false,
			message: "The configured fast model did not return a usable bullet summary.",
		};
	}
	return { ok: true, text: summary };
}

async function generateRawText(
	pi: BranchSlugRuntime,
	cwd: string,
	prompt: string,
	modelRef: string,
): Promise<TextResult> {
	const result = await generateRawTextWithModel({
		cwd,
		prompt,
		modelRef,
		exec: (command, args, options) => pi.exec(command, args, options),
	});
	if (!result.ok) {
		return { ok: false, message: formatRawTextModelFailure(result.failure) };
	}
	return { ok: true, text: result.evidence.rawOutput.trim() };
}

export function buildSlugPrompt(input: {
	kind: BranchSlugContentKind;
	content: string;
	sourceLabel?: string;
}): string {
	const kindDescription =
		input.kind === "plan"
			? "an implementation plan that will be stashed on a new branch"
			: "a user task prompt that will run in a new branch workspace";
	const contentLabel = input.sourceLabel ? `Source: ${input.sourceLabel}` : undefined;

	return [
		"Generate a concise git branch slug for this work item.",
		`The content is ${kindDescription}.`,
		"Infer the actual code/product change or outcome. Do not name the document, prompt, plan, context, storage workflow, or how this work item was initiated.",
		"Ignore metadata and provenance such as saved-plan filenames, source labels, suggested slugs, objective-next output, branch-create handoff text, and brmem storage details.",
		"If a command name appears only because it generated or initiated the plan, do not include it. Include command/product names only when the proposed work directly changes that command/product.",
		"Rules:",
		"- Return only the slug, with no quotes, markdown, or explanation.",
		"- Use kebab-case: lowercase ASCII words separated by hyphens.",
		`- Keep it at or under ${MAX_BRANCH_SLUG_LENGTH} characters.`,
		"- Lead with a verb when natural, such as add-, fix-, refactor-, migrate-, rename-, remove-, or update-.",
		"- Do not use spaces, underscores, slashes, punctuation, or special characters.",
		"- Do not include generic suffixes like -plan, -prompt, -context, -branch, -task, or -suggestion unless they are the real feature name.",
		"- Prefer concrete deliverables and specific nouns from the work item over broad words like changes, cleanup, or improvements.",
		"",
		contentLabel,
		"Content:",
		truncateForPrompt(input.content, MAX_SLUG_INPUT_CHARS),
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function buildPlanSummaryPrompt(input: { content: string; sourceLabel?: string }): string {
	const contentLabel = input.sourceLabel ? `Source: ${input.sourceLabel}` : undefined;
	return [
		"Summarize this implementation plan for display after it is persisted on a branch.",
		"Return only 3 to 5 markdown bullet lines.",
		"Each bullet must start with '- '. No heading, intro, code fence, or closing prose.",
		"Focus on concrete implementation work, important scope boundaries, and validation steps.",
		"Do not mention that the plan was stashed, persisted, saved, or stored.",
		"",
		contentLabel,
		"Plan:",
		truncateForPrompt(input.content, MAX_SUMMARY_INPUT_CHARS),
	]
		.filter((line): line is string => line !== undefined)
		.join("\n");
}

function truncateForPrompt(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function stripResponseFence(value: string): string {
	return value
		.replace(/^```[a-zA-Z0-9_-]*\n?/, "")
		.replace(/\n?```$/, "")
		.trim();
}
