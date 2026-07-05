import { readFileSync } from "node:fs";

export interface PromptTemplatePartials {
	readonly [placeholder: string]: string;
}

export const AUTO_TRIAGE_POLICY = readPromptMarkdown(
	"./download-feedback-auto-triage-policy.md",
	import.meta.url,
);

export const COMMON_FEEDBACK_POLICY = renderPromptTemplate(
	readPromptMarkdown("./download-feedback-common-policy.md", import.meta.url),
	{ "auto-triage-policy": AUTO_TRIAGE_POLICY },
);

export const DEFAULT_PROMPT_PARTIALS = {
	"auto-triage-policy": AUTO_TRIAGE_POLICY,
	"common-feedback-policy": COMMON_FEEDBACK_POLICY,
} satisfies PromptTemplatePartials;

export function readPromptMarkdown(path: string, baseUrl: string | URL): string {
	return readFileSync(new URL(path, baseUrl), "utf8").trim();
}

export function renderPromptTemplate(
	template: string,
	partials: PromptTemplatePartials = DEFAULT_PROMPT_PARTIALS,
): string {
	return Object.entries(partials).reduce(
		(rendered, [placeholder, value]) => rendered.replaceAll(`{{${placeholder}}}`, value),
		template,
	);
}
