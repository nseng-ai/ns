import { lstat, realpath } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import { isPathInside } from "@sdl/core/primitives";

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

export interface SkillLookupPathStat {
	isFile(): boolean;
	isDirectory(): boolean;
	isSymbolicLink(): boolean;
}

export interface SkillLookupSearchedRoot {
	root: SkillLookupRoot;
	sourceType: SkillLookupSourceType;
	searchedRelativePath: string;
	searchedPath: string;
}

export interface FoundSkillLookup {
	type: "found";
	root: SkillLookupRoot;
	sourceType: SkillLookupSourceType;
	baseRelativePath: string;
	skillFileRelativePath: string;
	basePath: string;
	skillFilePath: string;
}

export interface MissingSkillLookup {
	type: "missing";
	searchedRoots: readonly SkillLookupSearchedRoot[];
}

export interface FailedSkillLookup {
	type: "error";
	code: "skill-path-outside-project" | "skill-file-symlink" | "skill-file-resolve-failed";
	message: string;
	path: string;
}

export type SkillLookupResult = FoundSkillLookup | MissingSkillLookup | FailedSkillLookup;

export interface ResolveExactSkillLookupOptions {
	projectDir: string;
	skillName: string;
	statPath?: (path: string) => Promise<SkillLookupPathStat>;
	realpathPath?: (path: string) => Promise<string>;
}

export interface ResolveSkillLookupProjectRootOptions {
	cwd: string;
	statPath?: (path: string) => Promise<SkillLookupPathStat>;
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

export function buildSkillLookupSearchedRoots(
	projectDir: string,
	skillName: string,
): SkillLookupSearchedRoot[] {
	return SKILL_LOOKUP_ROOT_DESCRIPTORS.map((descriptor) => {
		const searchedRelativePath = `${descriptor.root}/${skillName}/SKILL.md`;
		return {
			root: descriptor.root,
			sourceType: descriptor.sourceType,
			searchedRelativePath,
			searchedPath: join(projectDir, descriptor.root, skillName, "SKILL.md"),
		};
	});
}

export async function resolveSkillLookupProjectRoot(
	options: ResolveSkillLookupProjectRootOptions,
): Promise<string> {
	const statPath = options.statPath ?? ((path: string) => lstat(path));
	let current = resolve(options.cwd);
	const root = parse(current).root;

	while (true) {
		if (await hasGitMarker(current, statPath)) return current;
		if (current === root) {
			throw new Error(`Could not find a Git repository root from ${options.cwd}.`);
		}
		current = dirname(current);
	}
}

export async function resolveExactSkillLookup(
	options: ResolveExactSkillLookupOptions,
): Promise<SkillLookupResult> {
	const statPath = options.statPath ?? ((path: string) => lstat(path));
	const realpathPath = options.realpathPath ?? ((path: string) => realpath(path));
	const projectDir = resolve(options.projectDir);
	const realProjectDir = await realpathPath(projectDir);
	const searchedRoots = buildSkillLookupSearchedRoots(projectDir, options.skillName);

	for (const descriptor of SKILL_LOOKUP_ROOT_DESCRIPTORS) {
		const baseRelativePath = `${descriptor.root}/${options.skillName}`;
		const skillFileRelativePath = `${baseRelativePath}/SKILL.md`;
		const basePath = join(projectDir, descriptor.root, options.skillName);
		const skillFilePath = join(basePath, "SKILL.md");
		const normalizedSkillFilePath = resolve(skillFilePath);
		if (!isPathInside(projectDir, normalizedSkillFilePath)) {
			return {
				type: "error",
				code: "skill-path-outside-project",
				message: `Backing skill path ${skillFilePath} resolves outside repository root ${projectDir}.`,
				path: skillFilePath,
			};
		}

		const skillStat = await statPathOrUndefined(statPath, skillFilePath);
		if (skillStat === undefined || (!skillStat.isFile() && !skillStat.isSymbolicLink())) {
			continue;
		}
		if (skillStat.isSymbolicLink()) {
			return {
				type: "error",
				code: "skill-file-symlink",
				message: `Refusing to read symlinked backing skill at ${skillFilePath}.`,
				path: skillFilePath,
			};
		}

		let realSkillFilePath: string;
		try {
			realSkillFilePath = await realpathPath(skillFilePath);
		} catch (error) {
			return {
				type: "error",
				code: "skill-file-resolve-failed",
				message: `Could not resolve backing skill path ${skillFilePath}: ${formatUnknownError(error)}`,
				path: skillFilePath,
			};
		}
		if (!isPathInside(realProjectDir, realSkillFilePath)) {
			return {
				type: "error",
				code: "skill-path-outside-project",
				message: `Backing skill path ${skillFilePath} resolves outside repository root ${projectDir}.`,
				path: skillFilePath,
			};
		}

		return {
			type: "found",
			root: descriptor.root,
			sourceType: descriptor.sourceType,
			baseRelativePath,
			skillFileRelativePath,
			basePath,
			skillFilePath,
		};
	}

	return { type: "missing", searchedRoots };
}

async function hasGitMarker(
	directory: string,
	statPath: (path: string) => Promise<SkillLookupPathStat>,
): Promise<boolean> {
	const marker = await statPathOrUndefined(statPath, join(directory, ".git"));
	return marker !== undefined && (marker.isDirectory() || marker.isFile());
}

async function statPathOrUndefined(
	statPath: (path: string) => Promise<SkillLookupPathStat>,
	path: string,
): Promise<SkillLookupPathStat | undefined> {
	try {
		return await statPath(path);
	} catch {
		return undefined;
	}
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
