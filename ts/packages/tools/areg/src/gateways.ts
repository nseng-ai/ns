import {
	SKILL_LOOKUP_ROOT_DESCRIPTORS,
	skillLookupDescriptorForSourceType,
} from "@nseng-ai/foundation/skill-lookup";
import type {
	SkillLookupRoot,
	SkillLookupRootDescriptor,
	SkillLookupSourceType,
} from "@nseng-ai/foundation/skill-lookup";
import type { GitGateway } from "@nseng-ai/capability-kit/git";
import type { ErrorInfo, Result } from "@nseng-ai/foundation/result";
import type { PathState, TextFileState } from "@nseng-ai/harness-artifacts/api";

import type { AregManifestSkillSourcesInspection } from "./operations/manifest-sources.ts";

// The git methods areg consumes: resolve the repo root and materialize
// worktree-relative git paths (for example `info/exclude`). A full `GitGateway`
// is assignable to this narrowed surface.
export type AregGitGateway = Pick<GitGateway, "optionalRepoRoot" | "gitPath">;

export type AregErrorInfo = ErrorInfo;

export type AregOperationResult = Result<undefined, AregErrorInfo>;

export type { PathState, TextFileState };

export interface AregCheckSkillInspection {
	name: string;
	skillsPath: PathState;
	agentsPath: PathState;
	claudePath: PathState;
	localSkillMd: TextFileState;
	remoteSkillMd: TextFileState;
	openaiPolicy: TextFileState;
}

export function missingCheckSkillInspection(name: string): AregCheckSkillInspection {
	const missing = { type: "missing" as const };
	return {
		name,
		skillsPath: missing,
		agentsPath: missing,
		claudePath: missing,
		localSkillMd: missing,
		remoteSkillMd: missing,
		openaiPolicy: missing,
	};
}

export interface AregCheckPairingDirectory {
	relativeDir: string;
	hasAgents: boolean;
	hasClaude: boolean;
	claudeText?: string;
}

export type AregSkillKindSourceType = Extract<SkillLookupSourceType, "repo" | "vendored">;
export type AregSkillKindRootDescriptor = Extract<
	SkillLookupRootDescriptor,
	{ sourceType: AregSkillKindSourceType }
>;

export const AREG_SKILL_KIND_ROOT_DESCRIPTORS = SKILL_LOOKUP_ROOT_DESCRIPTORS.filter(
	(descriptor): descriptor is AregSkillKindRootDescriptor =>
		descriptor.sourceType === "repo" || descriptor.sourceType === "vendored",
);

export function skillKindDescriptorForSourceType(
	sourceType: AregSkillKindSourceType,
): AregSkillKindRootDescriptor {
	const descriptor = skillLookupDescriptorForSourceType(sourceType);
	if (descriptor.sourceType !== "repo" && descriptor.sourceType !== "vendored") {
		throw new Error(`Unknown skill-kind source type: ${sourceType}`);
	}
	return descriptor;
}

export interface AregSkillFindSkillInspection {
	name: string;
	root: SkillLookupRoot;
	sourceType: SkillLookupSourceType;
	baseRelativePath: string;
	skillDir: PathState;
	skillMd: TextFileState;
}

export interface AregSkillFindRootsInspection {
	skills: readonly AregSkillFindSkillInspection[];
}

export interface AregSkillKindSkillInspection {
	name: string;
	sourceType: AregSkillKindSourceType;
	baseRelativePath: string;
	skillDir: PathState;
	skillMd: TextFileState;
	openaiPolicy: TextFileState;
	agentsPath: PathState;
	claudePath: PathState;
}

export interface AregReplacementInspection {
	verifiedSurfaces: readonly string[];
}

export interface AregProjectInspectionRequest {
	cwd: string;
	projectPath: string;
	env: NodeJS.ProcessEnv;
}

export interface AregProjectDirRequest {
	projectDir: string;
	env: NodeJS.ProcessEnv;
}

export interface AregSkillInspectionRequest {
	projectDir: string;
	skillName: string;
	env: NodeJS.ProcessEnv;
}

export interface AregProjectBaseInspection {
	projectDir: string;
	projectPathState: PathState;
	lockfile: TextFileState;
	nsToml: TextFileState;
	aregJson: TextFileState;
}

export interface AregPiArtifactsInspection {
	piDir: PathState;
	piSettings: TextFileState;
	replacement: AregReplacementInspection;
}

export interface AregPiSkillInventoryInspection {
	skillNames: readonly string[];
	isApproximation: boolean;
	source: string;
}

export interface AregSkillNameInventory {
	skillsDirectoryNames: readonly string[];
	agentsSkillNames: readonly string[];
	claudeSkillNames: readonly string[];
	skillKindNames: readonly string[];
}

export interface AregSkillKindResolveRequest {
	projectDir: string;
	spec: string;
	cwd: string;
	env: NodeJS.ProcessEnv;
}

export type AregSkillKindResolveResult =
	| { type: "ok"; skillName: string }
	| { type: "error"; error: AregErrorInfo };

export interface AregProjectTextWriteRequest {
	projectDir: string;
	relativePath: string;
	content: string;
	description: string;
	createParent: boolean;
	env: NodeJS.ProcessEnv;
}

export interface AregProjectManagedTargetRequest {
	projectDir: string;
	relativePath: string;
	description: string;
	env: NodeJS.ProcessEnv;
}

export type AregProjectFileDeleteRequest = AregProjectManagedTargetRequest;
export type AregProjectRemoveEmptyDirRequest = AregProjectManagedTargetRequest;
export type AregProjectSymlinkDeleteRequest = AregProjectManagedTargetRequest;

export type AregProjectMutationResult = { ok: true } | { ok: false; error: AregErrorInfo };
export type AregProjectRemoveEmptyDirResult =
	| { ok: true; removed: boolean }
	| { ok: false; error: AregErrorInfo };

/**
 * Areg's project-resource gateway.
 *
 * This is intentionally domain-oriented: it exposes named areg project facts and
 * project-scoped safe mutation primitives, not a generic filesystem API. Add new
 * reads here only when they represent stable areg project concepts, and route new
 * writes/deletes through project-scoped primitives. Do not
 * add an unrestricted filesystem gateway to areg as a convenience for operation code.
 */
export interface AregProjectGateway {
	inspectProjectBase(request: AregProjectInspectionRequest): Promise<AregProjectBaseInspection>;
	inspectPiArtifacts(request: AregProjectDirRequest): Promise<AregPiArtifactsInspection>;
	inspectPiSkillInventory(request: AregProjectDirRequest): Promise<AregPiSkillInventoryInspection>;
	inspectSkillNameInventory(request: AregProjectDirRequest): Promise<AregSkillNameInventory>;
	inspectManifestSkillSources(
		request: AregProjectDirRequest,
	): Promise<AregManifestSkillSourcesInspection>;
	inspectSkillFindRoots(request: AregProjectDirRequest): Promise<AregSkillFindRootsInspection>;
	inspectCheckSkill(request: AregSkillInspectionRequest): Promise<AregCheckSkillInspection>;
	inspectSkillKindSkill(request: AregSkillInspectionRequest): Promise<AregSkillKindSkillInspection>;
	inspectPairingDirectories(
		request: AregProjectDirRequest,
	): Promise<readonly AregCheckPairingDirectory[]>;
	readLocallyExcludedSkillNames(request: AregProjectDirRequest): Promise<readonly string[]>;
	resolveSkillKindSpec(request: AregSkillKindResolveRequest): Promise<AregSkillKindResolveResult>;
	preflightWriteTextFile(request: AregProjectTextWriteRequest): Promise<AregProjectMutationResult>;
	preflightDeleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult>;
	preflightDeleteSymlink(
		request: AregProjectSymlinkDeleteRequest,
	): Promise<AregProjectMutationResult>;
	preflightRemoveEmptyDir(
		request: AregProjectRemoveEmptyDirRequest,
	): Promise<AregProjectMutationResult>;
	writeTextFile(request: AregProjectTextWriteRequest): Promise<AregProjectMutationResult>;
	deleteFile(request: AregProjectFileDeleteRequest): Promise<AregProjectMutationResult>;
	deleteSymlink(request: AregProjectSymlinkDeleteRequest): Promise<AregProjectMutationResult>;
	removeEmptyDir(
		request: AregProjectRemoveEmptyDirRequest,
	): Promise<AregProjectRemoveEmptyDirResult>;
}

export interface AregSkillKindTextWritePlan {
	relativePath: string;
	content: string;
	description: string;
	createParent: boolean;
}

export interface AregSkillKindDeletePlan {
	relativePath: string;
	description: string;
}

export interface AregSkillKindDeleteSymlinkPlan {
	relativePath: string;
	description: string;
}

export interface AregSkillKindRemoveEmptyDirPlan {
	relativePath: string;
	description: string;
}
