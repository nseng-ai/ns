/**
 * Capability API for `@nseng-ai/harness-artifacts` — the shared home for
 * harness-artifact conventions pushed down from `@nseng-ai/areg` (see the
 * `skill-management-subsystem` Objective). Cross-package consumers import
 * from this door only.
 */

export type { PathState, TextFileState } from "./fs-state.ts";
export {
	parseSkillFrontmatterBlock,
	parseSkillFrontmatterTopLevelLine,
	isSkillFrontmatterTopLevelKey,
	transformSkillFrontmatter,
	type SkillFrontmatterData,
	type SkillFrontmatterParseResult,
	type SkillFrontmatterTopLevelLineParseResult,
} from "./skill-frontmatter.ts";
export {
	agentsSkillMirrorRelativePath,
	claudeSkillMirrorRelativePath,
	classifySkillMirrorSymlinkState,
	expectedAgentsSkillSymlinkTarget,
	expectedClaudeSkillSymlinkTarget,
	expectedMirrorTarget,
	isAgentsSkillMirror,
	isClaudeSkillMirror,
	isSkillMirrorRelativePath,
	parseSkillMirrorRelativePath,
	type SkillMirrorKind,
	type SkillMirrorRelativePathInfo,
} from "./skill-mirror-conventions.ts";
export {
	parseInspectedLockfile,
	parseLockfileData,
	parseLockfileText,
	SOURCE_TYPES,
	type LockfileSkill,
	type LockfileSkillData,
	type SkillsLockfile,
	type SkillsLockfileData,
	type SourceType,
} from "./skills-lockfile.ts";
