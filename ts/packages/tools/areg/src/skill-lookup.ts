import { join } from "node:path";

export const SKILL_LOOKUP_ROOT_DESCRIPTORS = [
	{ root: "skills", sourceType: "repo" },
	{ root: ".agents/skills", sourceType: "vendored" },
	{ root: ".claude/skills", sourceType: "claude" },
] as const satisfies ReadonlyArray<{ root: string; sourceType: string }>;

export type SkillLookupRootDescriptor = (typeof SKILL_LOOKUP_ROOT_DESCRIPTORS)[number];
export type SkillLookupRoot = SkillLookupRootDescriptor["root"];
export type SkillLookupSourceType = SkillLookupRootDescriptor["sourceType"];

export const SKILL_LOOKUP_ROOTS = SKILL_LOOKUP_ROOT_DESCRIPTORS.map(
	(descriptor): SkillLookupRoot => descriptor.root,
) as [SkillLookupRoot, ...SkillLookupRoot[]];
export const SKILL_LOOKUP_SOURCE_TYPES = SKILL_LOOKUP_ROOT_DESCRIPTORS.map(
	(descriptor): SkillLookupSourceType => descriptor.sourceType,
) as [SkillLookupSourceType, ...SkillLookupSourceType[]];

const SKILL_LOOKUP_DESCRIPTOR_BY_ROOT = new Map<SkillLookupRoot, SkillLookupRootDescriptor>(
	SKILL_LOOKUP_ROOT_DESCRIPTORS.map((descriptor) => [descriptor.root, descriptor] as const),
);
const SKILL_LOOKUP_DESCRIPTOR_BY_SOURCE_TYPE = new Map<
	SkillLookupSourceType,
	SkillLookupRootDescriptor
>(SKILL_LOOKUP_ROOT_DESCRIPTORS.map((descriptor) => [descriptor.sourceType, descriptor] as const));
const SKILL_LOOKUP_ROOT_RANKS = new Map<SkillLookupRoot, number>(
	SKILL_LOOKUP_ROOT_DESCRIPTORS.map((descriptor, index) => [descriptor.root, index] as const),
);

export interface SkillLookupSearchedRoot {
	root: SkillLookupRoot;
	sourceType: SkillLookupSourceType;
	searchedRelativePath: string;
	searchedPath: string;
}

export function skillLookupDescriptorForRoot(root: SkillLookupRoot): SkillLookupRootDescriptor {
	const descriptor = SKILL_LOOKUP_DESCRIPTOR_BY_ROOT.get(root);
	if (descriptor === undefined) throw new Error(`Unknown skill lookup root: ${root}`);
	return descriptor;
}

export function skillLookupDescriptorForSourceType(
	sourceType: SkillLookupSourceType,
): SkillLookupRootDescriptor {
	const descriptor = SKILL_LOOKUP_DESCRIPTOR_BY_SOURCE_TYPE.get(sourceType);
	if (descriptor === undefined) throw new Error(`Unknown skill lookup source type: ${sourceType}`);
	return descriptor;
}

export function skillLookupRootRank(root: SkillLookupRoot): number {
	return SKILL_LOOKUP_ROOT_RANKS.get(root) ?? SKILL_LOOKUP_ROOT_DESCRIPTORS.length;
}

export function skillLookupBaseRelativePath(root: SkillLookupRoot, skillName: string): string {
	return `${root}/${skillName}`;
}

export function skillLookupFileRelativePath(root: SkillLookupRoot, skillName: string): string {
	return `${skillLookupBaseRelativePath(root, skillName)}/SKILL.md`;
}

export function buildSkillLookupSearchedRoots(
	projectDir: string,
	skillName: string,
): SkillLookupSearchedRoot[] {
	return SKILL_LOOKUP_ROOT_DESCRIPTORS.map((descriptor) => {
		const searchedRelativePath = skillLookupFileRelativePath(descriptor.root, skillName);
		return {
			root: descriptor.root,
			sourceType: descriptor.sourceType,
			searchedRelativePath,
			searchedPath: join(projectDir, searchedRelativePath),
		};
	});
}
