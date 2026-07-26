/**
 * Cross-package door for `@nseng-ai/ns` (`@nseng-ai/ns/api`): the skill-frontmatter
 * conventions other packages are allowed to consume. This is a thin facade — logic
 * lives in the `harness-artifacts` feature. Modules inside `@nseng-ai/ns` import that
 * feature directly rather than routing through this door.
 *
 * Exports here are curated, not swept: the published surface widens only by an
 * explicit edit. Add a symbol when a cross-package consumer needs it.
 */

export {
	isSkillFrontmatterTopLevelKey,
	parseSkillFrontmatterBlock,
	parseSkillFrontmatterTopLevelLine,
	transformSkillFrontmatter,
	type SkillFrontmatterData,
	type SkillFrontmatterParseResult,
	type SkillFrontmatterTopLevelLineParseResult,
} from "../harness-artifacts/skill-frontmatter.ts";
