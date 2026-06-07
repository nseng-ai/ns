import {
	finalizeBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	trimBranchSlugToLength,
} from "@asdl/pi-extension-runtime/branch-slug";
import type { TextResult } from "./primitives.ts";
import type { ExtensionAPI } from "./types.ts";

export { finalizeBranchSlug, MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName, trimBranchSlugToLength };

const GPT_NANO_PROVIDER = "openai";
const GPT_NANO_MODEL = "gpt-5.4-nano";
const SLUG_PROMPT_TIMEOUT_MS = 60_000;
const SUMMARY_PROMPT_TIMEOUT_MS = 60_000;
const MAX_SLUG_INPUT_CHARS = 12_000;
const MAX_SUMMARY_INPUT_CHARS = 16_000;

export type BranchSlugContentKind = "task" | "plan";

type BranchSlugRuntime = Pick<ExtensionAPI, "exec">;

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
	const result = await runGptNanoText(pi, cwd, prompt, SLUG_PROMPT_TIMEOUT_MS);
	if (!result.ok) {
		return { ok: false, message: `Could not generate branch slug with GPT Nano: ${result.message}` };
	}

	const slug = sanitizeBranchName(result.text) || sanitizeBranchName(input.fallbackText ?? input.content);
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
	const result = await runGptNanoText(pi, cwd, buildPlanSummaryPrompt(input), SUMMARY_PROMPT_TIMEOUT_MS);
	if (!result.ok) {
		return { ok: false, message: `Could not summarize plan with GPT Nano: ${result.message}` };
	}

	const summary = stripResponseFence(result.text).trim();
	if (!summary) {
		return { ok: false, message: "GPT Nano did not return a usable bullet summary." };
	}
	return { ok: true, text: summary };
}

async function runGptNanoText(pi: BranchSlugRuntime, cwd: string, prompt: string, timeout: number): Promise<TextResult> {
	const result = await pi.exec(
		"pi",
		[
			"--provider",
			GPT_NANO_PROVIDER,
			"--model",
			GPT_NANO_MODEL,
			"--thinking",
			"low",
			"--no-session",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			"--no-tools",
			"--mode",
			"text",
			"--print",
			prompt,
		],
		{ cwd, timeout },
	);
	if (result.code !== 0) {
		const details = result.stderr.trim() || result.stdout.trim();
		return { ok: false, message: details };
	}
	return { ok: true, text: result.stdout.trim() };
}

function buildSlugPrompt(input: {
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
