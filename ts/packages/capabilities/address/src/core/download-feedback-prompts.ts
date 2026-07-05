import { readFileSync } from "node:fs";

export const COMMON_FEEDBACK_POLICY = readPromptMarkdown(
	"./download-feedback-common-policy.md",
	import.meta.url,
);

export function readPromptMarkdown(path: string, baseUrl: string | URL): string {
	return readFileSync(new URL(path, baseUrl), "utf8").trim();
}

export function renderPromptTemplate(
	template: string,
	commonFeedbackPolicy = COMMON_FEEDBACK_POLICY,
): string {
	return template.replace("{{common-feedback-policy}}", commonFeedbackPolicy);
}
