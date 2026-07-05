import { fileURLToPath } from "node:url";

const BRANCH_CONTEXT_IMPL_PROMPT_TEMPLATE_URL = new URL(
	"./prompts/branch-context-impl.md",
	import.meta.url,
);

export function branchContextImplPromptTemplateUrl(): URL {
	return BRANCH_CONTEXT_IMPL_PROMPT_TEMPLATE_URL;
}

export function branchContextImplPromptTemplatePath(): string {
	return fileURLToPath(BRANCH_CONTEXT_IMPL_PROMPT_TEMPLATE_URL);
}
