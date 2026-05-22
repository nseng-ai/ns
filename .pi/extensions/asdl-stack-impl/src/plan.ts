import { extractFrontmatter } from "./frontmatter.ts";
import { sha256Hex } from "./hash.ts";
import { validateStackPlanFrontmatter, type StackPlanFrontmatter } from "./schemas.ts";

export type StackPlanDocument = StackPlanFrontmatter & {
	body: string;
	content: string;
	sha256: string;
};

export function parseStackPlanMarkdown(content: string): StackPlanDocument {
	const { frontmatterText, body } = extractFrontmatter(content);
	const frontmatter = validateStackPlanFrontmatter(frontmatterText, body);
	return {
		...frontmatter,
		body,
		content,
		sha256: sha256Hex(content),
	};
}
