// Compatibility shim: @asdl/ccc owns cmux command orchestration.
export {
	finalizeBranchSlug,
	generateBranchSlug,
	MAX_BRANCH_SLUG_LENGTH,
	sanitizeBranchName,
	summarizePlanWithGptNano,
	trimBranchSlugToLength,
} from "../../../ccc/src/cmux/branch-slug.ts";
export type { BranchSlugContentKind } from "../../../ccc/src/cmux/branch-slug.ts";
