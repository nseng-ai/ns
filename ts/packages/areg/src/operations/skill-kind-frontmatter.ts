import type { Result } from "@asdl/core/result";

import { transformSkillFrontmatter } from "./frontmatter.ts";
import { DISABLE_MODEL_INVOCATION_KEY, USER_INVOCABLE_KEY, type SkillInvocationKind } from "./skill-kind-inference.ts";
import type { PlannedApplyOperation } from "./skill-kind-apply-plan.ts";

export function planFrontmatterOperation(skillName: string, text: string, kind: SkillInvocationKind): Result<PlannedApplyOperation> {
	const relativePath = `skills/${skillName}/SKILL.md`;
	// Inference parses frontmatter into normalized key/value facts, while apply planning
	// rewrites source text and must preserve delimiter bounds, line endings, unrelated
	// keys, and body text. Keep the parse and rewrite paths separate even though both
	// validate frontmatter before changing managed keys.
	const transformed = transformSkillFrontmatter(text, relativePath, desiredFrontmatter(kind));
	if (!transformed.ok) return transformed;
	if (transformed.value === text) return { ok: true, value: { type: "skip", relativePath, description: "SKILL.md", reason: "SKILL.md frontmatter already current" } };
	return { ok: true, value: { type: "write", relativePath, description: "SKILL.md", content: transformed.value, createParent: false } };
}

export function desiredFrontmatter(kind: SkillInvocationKind): Readonly<Record<string, string | undefined>> {
	return {
		[DISABLE_MODEL_INVOCATION_KEY]: kind === "invoke-only" || kind === "command-backed" ? "true" : undefined,
		[USER_INVOCABLE_KEY]: kind === "ambient-only" ? "false" : undefined,
	};
}
