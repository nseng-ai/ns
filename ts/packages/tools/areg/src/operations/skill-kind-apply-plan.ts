import { err, type Result } from "@nseng-ai/foundation/result";

import type {
	AregSkillKindDeletePlan,
	AregSkillKindDeleteSymlinkPlan,
	AregSkillKindRemoveEmptyDirPlan,
	AregSkillKindSkillInspection,
	AregSkillKindTextWritePlan,
} from "../gateways.ts";
import { replacementAdvice, verifyPiReplacement } from "./pi-replacement.ts";
import {
	agentsSkillMirrorRelativePath,
	claudeSkillMirrorRelativePath,
	expectedAgentsSkillSymlinkTarget,
	expectedClaudeSkillSymlinkTarget,
} from "@nseng-ai/harness-artifacts/api";
import { parsePiSettings, type PiSettingsData } from "./pi-settings.ts";
import {
	PROJECT_FILE_MUTATION_OPERATION_TYPES,
	PROJECT_MUTATION_OPERATION_TYPES,
	type ProjectMutationOperationStatusRecord,
} from "./project-mutations.ts";
import { planFrontmatterOperation } from "./skill-kind-frontmatter.ts";
import {
	isLegacyBareOpenaiPolicyContent,
	isManagedOpenaiPolicyContent,
	KIND_PROPERTIES,
	MANAGED_OPENAI_POLICY,
	type SkillInvocationKind,
	type SkillKindProjectInspection,
	validateInspectableSkill,
} from "./skill-kind-inference.ts";

export const APPLY_OPERATION_TYPES = [...PROJECT_FILE_MUTATION_OPERATION_TYPES, "skip"] as const;
export const APPLY_STATUS_OPERATION_TYPES = [...PROJECT_MUTATION_OPERATION_TYPES, "skip"] as const;

export type ApplyOperationType = (typeof APPLY_OPERATION_TYPES)[number];

export interface PlannedApplyOperationBase {
	type: ApplyOperationType;
	relativePath: string;
	description: string;
}

export interface PlannedWriteOperation extends PlannedApplyOperationBase {
	type: "write";
	content: string;
	shouldCreateParent: boolean;
}

export interface PlannedSkipOperation extends PlannedApplyOperationBase {
	type: "skip";
	reason: string;
}

export interface PlannedDeleteOperation extends PlannedApplyOperationBase {
	type: "delete";
}

export interface PlannedRemoveEmptyDirOperation extends PlannedApplyOperationBase {
	type: "remove-empty-dir";
}

export interface PlannedDeleteSymlinkOperation extends PlannedApplyOperationBase {
	type: "delete-symlink";
	expectedTarget: string;
}

export type PlannedApplyOperation =
	| PlannedWriteOperation
	| PlannedSkipOperation
	| PlannedDeleteOperation
	| PlannedDeleteSymlinkOperation
	| PlannedRemoveEmptyDirOperation;

export interface SkillKindApplyPlan {
	skill: string;
	kind: SkillInvocationKind;
	operations: readonly PlannedApplyOperation[];
}

export interface SkillKindApplyOperationResult {
	type: ApplyOperationType;
	path: string;
	reason?: string;
	isApplied: boolean;
}

export interface SkillKindApplySkipStatusResult {
	type: "skip";
	path: string;
	description: string;
	status: "skipped";
	error?: unknown;
}

export type SkillKindApplyOperationStatusResult =
	| ProjectMutationOperationStatusRecord
	| SkillKindApplySkipStatusResult;

export function buildSkillKindApplyPlan(
	inspection: SkillKindProjectInspection,
	skillName: string,
	kind: SkillInvocationKind,
): Result<SkillKindApplyPlan> {
	const skill = inspection.skills.find((candidate) => candidate.name === skillName);
	if (skill === undefined)
		return err({ code: "skill_not_found", message: `Managed skill not found: ${skillName}` });
	const readiness = validateInspectableSkill(skill);
	if (!readiness.ok) return readiness;
	if (skill.skillMd.type !== "file")
		return err({
			code: "skill_not_found",
			message: `${skill.baseRelativePath}/SKILL.md does not exist`,
		});
	if (kind === "command-backed") {
		const replacement = verifyPiReplacement(skill.name, inspection.replacement);
		if (!replacement.verified)
			return err({
				code: "skill_not_found",
				message: replacementAdvice(skill.name, replacement.surface),
			});
	}
	if (kind === "unlisted") {
		if (skill.sourceType !== "repo")
			return err({
				code: "unlisted_requires_first_party",
				message: `Skill '${skill.name}' is not first-party (${skill.baseRelativePath}); unlisted only applies to skills/<name>/ sources.`,
			});
		const replacement = verifyPiReplacement(skill.name, inspection.replacement);
		if (replacement.surface !== undefined)
			return err({
				code: "unlisted_registry_surface_present",
				message: `Skill '${skill.name}' still has a COMMAND_BACKED_SKILL_REGISTRY entry (/${replacement.surface}); remove the registry entry first, then apply unlisted.`,
			});
	}
	const piSettings = parsePiSettings(inspection.piDir, inspection.piSettings);
	if (!piSettings.ok) return piSettings;
	const frontmatter = planFrontmatterOperation(skill.baseRelativePath, skill.skillMd.text, kind);
	if (!frontmatter.ok) return frontmatter;
	const sidecar = planSidecarOperations(skill, kind);
	if (!sidecar.ok) return sidecar;
	const pi = planPiSettingsOperation(skill.name, kind, piSettings.value);
	if (!pi.ok) return pi;
	const mirrors = planMirrorOperations(skill, kind);
	if (!mirrors.ok) return mirrors;
	return {
		ok: true,
		value: {
			skill: skill.name,
			kind,
			operations: [frontmatter.value, ...sidecar.value, pi.value, ...mirrors.value],
		},
	};
}

export function inspectionAfterPlannedApply(
	inspection: SkillKindProjectInspection,
	plan: SkillKindApplyPlan,
): SkillKindProjectInspection {
	const piSettingsWrite = plan.operations.find(
		(operation): operation is PlannedWriteOperation =>
			operation.type === "write" && operation.relativePath === ".pi/settings.json",
	);
	return {
		...inspection,
		piSettings:
			piSettingsWrite === undefined
				? inspection.piSettings
				: { type: "file", text: piSettingsWrite.content },
		skills: inspection.skills.map((skill) =>
			skill.name === plan.skill ? skillAfterPlannedApply(skill, plan) : skill,
		),
	};
}

export function skillAfterPlannedApply(
	skill: AregSkillKindSkillInspection,
	plan: SkillKindApplyPlan,
): AregSkillKindSkillInspection {
	let skillMd = skill.skillMd;
	let openaiPolicy = skill.openaiPolicy;
	let agentsPath = skill.agentsPath;
	let claudePath = skill.claudePath;
	for (const operation of plan.operations) {
		if (
			operation.type === "write" &&
			operation.relativePath === `${skill.baseRelativePath}/SKILL.md`
		)
			skillMd = { type: "file", text: operation.content };
		if (
			operation.type === "write" &&
			operation.relativePath === `${skill.baseRelativePath}/agents/openai.yaml`
		)
			openaiPolicy = { type: "file", text: operation.content };
		if (
			operation.type === "delete" &&
			operation.relativePath === `${skill.baseRelativePath}/agents/openai.yaml`
		)
			openaiPolicy = { type: "missing" };
		if (
			operation.type === "delete-symlink" &&
			operation.relativePath === agentsSkillMirrorRelativePath(skill.name)
		)
			agentsPath = { type: "missing" };
		if (
			operation.type === "delete-symlink" &&
			operation.relativePath === claudeSkillMirrorRelativePath(skill.name)
		)
			claudePath = { type: "missing" };
	}
	return { ...skill, skillMd, openaiPolicy, agentsPath, claudePath };
}

/**
 * Plans skill mirror symlink removals. Only the unlisted kind manages mirrors,
 * and only in the delete direction: areg never creates mirror symlinks, so
 * reverting unlisted back to a listed kind requires re-running the
 * skill-management install flow (areg check stays red until the mirrors are
 * reinstalled).
 */
export function planMirrorOperations(
	skill: AregSkillKindSkillInspection,
	kind: SkillInvocationKind,
): Result<readonly PlannedApplyOperation[]> {
	if (kind !== "unlisted") return { ok: true, value: [] };
	const mirrors = [
		{
			relativePath: claudeSkillMirrorRelativePath(skill.name),
			description: "Claude skill mirror symlink",
			expectedTarget: expectedClaudeSkillSymlinkTarget(skill.name),
			state: skill.claudePath,
		},
		{
			relativePath: agentsSkillMirrorRelativePath(skill.name),
			description: "agents skill mirror symlink",
			expectedTarget: expectedAgentsSkillSymlinkTarget(skill.name),
			state: skill.agentsPath,
		},
	];
	const operations: PlannedApplyOperation[] = [];
	for (const mirror of mirrors) {
		if (mirror.state.type === "missing") {
			operations.push({
				type: "skip",
				relativePath: mirror.relativePath,
				description: mirror.description,
				reason: `${mirror.relativePath} absent`,
			});
			continue;
		}
		if (mirror.state.type !== "symlink")
			return err({
				code: "mirror_not_symlink",
				message: `${mirror.relativePath} exists but is not a symlink; resolve it manually before applying unlisted.`,
			});
		if (mirror.state.target !== mirror.expectedTarget)
			return err({
				code: "mirror_wrong_target",
				message: `${mirror.relativePath} points to ${mirror.state.target}, expected ${mirror.expectedTarget}; resolve it manually before applying unlisted.`,
			});
		operations.push({
			type: "delete-symlink",
			relativePath: mirror.relativePath,
			description: mirror.description,
			expectedTarget: mirror.expectedTarget,
		});
	}
	return { ok: true, value: operations };
}

export function planSidecarOperations(
	skill: AregSkillKindSkillInspection,
	kind: SkillInvocationKind,
): Result<readonly PlannedApplyOperation[]> {
	const relativePath = `${skill.baseRelativePath}/agents/openai.yaml`;
	const agentsDir = `${skill.baseRelativePath}/agents`;
	const shouldExist = KIND_PROPERTIES[kind].hasCodexSidecar;
	if (shouldExist) {
		if (skill.openaiPolicy.type === "symlink")
			return err({
				code: "path_symlink",
				message: `${relativePath} is a symlink; refusing to manage it.`,
			});
		if (skill.openaiPolicy.type === "file") {
			if (isManagedOpenaiPolicyContent(skill.openaiPolicy.text))
				return {
					ok: true,
					value: [
						{
							type: "skip",
							relativePath,
							description: "Codex openai.yaml",
							reason: "Codex openai.yaml already current",
						},
					],
				};
			if (isLegacyBareOpenaiPolicyContent(skill.openaiPolicy.text))
				return {
					ok: true,
					value: [
						{
							type: "write",
							relativePath,
							description: "Codex openai.yaml",
							content: MANAGED_OPENAI_POLICY,
							shouldCreateParent: true,
						},
					],
				};
			return err({
				code: "non_managed_openai_policy",
				message: `${relativePath} exists with non-managed content; resolve it manually before applying ${kind}.`,
			});
		}
		if (skill.openaiPolicy.type !== "missing")
			return err({ code: "path_not_file", message: `${relativePath} exists but is not a file.` });
		return {
			ok: true,
			value: [
				{
					type: "write",
					relativePath,
					description: "Codex openai.yaml",
					content: MANAGED_OPENAI_POLICY,
					shouldCreateParent: true,
				},
			],
		};
	}
	if (skill.openaiPolicy.type === "missing")
		return {
			ok: true,
			value: [
				{
					type: "skip",
					relativePath,
					description: "Codex openai.yaml",
					reason: "Codex openai.yaml absent",
				},
			],
		};
	if (skill.openaiPolicy.type === "symlink")
		return err({
			code: "path_symlink",
			message: `${relativePath} is a symlink; refusing to delete it.`,
		});
	if (skill.openaiPolicy.type !== "file")
		return err({ code: "path_not_file", message: `${relativePath} exists but is not a file.` });
	if (!isManagedOpenaiPolicyContent(skill.openaiPolicy.text))
		return err({
			code: "non_managed_openai_policy",
			message: `${relativePath} exists with non-managed content; resolve it manually before applying ${kind}.`,
		});
	return {
		ok: true,
		value: [
			{ type: "delete", relativePath, description: "Codex openai.yaml" },
			{
				type: "remove-empty-dir",
				relativePath: agentsDir,
				description: "empty skill agents directory",
			},
		],
	};
}

export function planPiSettingsOperation(
	skillName: string,
	kind: SkillInvocationKind,
	settings: PiSettingsData,
): Result<PlannedApplyOperation> {
	const relativePath = ".pi/settings.json";
	const entry = `-skills/${skillName}`;
	const shouldExclude = KIND_PROPERTIES[kind].isPiExcluded;
	const currentExclusions = settings.exclusions;
	const hasEntry = currentExclusions.includes(entry);
	if (shouldExclude && hasEntry)
		return {
			ok: true,
			value: {
				type: "skip",
				relativePath,
				description: "Pi settings",
				reason: `${entry} already present`,
			},
		};
	if (!shouldExclude && !hasEntry)
		return {
			ok: true,
			value: { type: "skip", relativePath, description: "Pi settings", reason: `${entry} absent` },
		};
	const nextData: Record<string, unknown> = settings.data === undefined ? {} : { ...settings.data };
	const nextSkills = shouldExclude
		? [...currentExclusions, entry]
		: currentExclusions.filter((candidate) => candidate !== entry);
	nextData.skills = nextSkills;
	return {
		ok: true,
		value: {
			type: "write",
			relativePath,
			description: "Pi settings",
			content: `${JSON.stringify(nextData, null, 2)}\n`,
			shouldCreateParent: settings.text === undefined,
		},
	};
}

export function hasDeletionPrompt(plan: SkillKindApplyPlan): boolean {
	return plan.operations.some(isDeletionOperation);
}

export function deletionPrompt(plan: SkillKindApplyPlan): string {
	const paths = plan.operations
		.filter(isDeletionOperation)
		.map((operation) => `- ${operation.relativePath}`)
		.join("\n");
	return `Apply ${plan.kind} to ${plan.skill} will delete harness overlays:\n${paths}\nContinue?`;
}

function isDeletionOperation(operation: PlannedApplyOperation): boolean {
	return (
		operation.type === "delete" ||
		operation.type === "delete-symlink" ||
		operation.type === "remove-empty-dir"
	);
}

export function plannedWrites(plan: SkillKindApplyPlan): readonly AregSkillKindTextWritePlan[] {
	return plan.operations.flatMap((operation) =>
		operation.type === "write"
			? [
					{
						relativePath: operation.relativePath,
						content: operation.content,
						description: operation.description,
						createParent: operation.shouldCreateParent,
					},
				]
			: [],
	);
}

export function plannedDeletes(plan: SkillKindApplyPlan): readonly AregSkillKindDeletePlan[] {
	return plan.operations.flatMap((operation) =>
		operation.type === "delete"
			? [{ relativePath: operation.relativePath, description: operation.description }]
			: [],
	);
}

export function plannedDeleteSymlinks(
	plan: SkillKindApplyPlan,
): readonly AregSkillKindDeleteSymlinkPlan[] {
	return plan.operations.flatMap((operation) =>
		operation.type === "delete-symlink"
			? [{ relativePath: operation.relativePath, description: operation.description }]
			: [],
	);
}

export function plannedRemoveEmptyDirs(
	plan: SkillKindApplyPlan,
): readonly AregSkillKindRemoveEmptyDirPlan[] {
	return plan.operations.flatMap((operation) =>
		operation.type === "remove-empty-dir"
			? [{ relativePath: operation.relativePath, description: operation.description }]
			: [],
	);
}

export function toApplyResult(
	operation: PlannedApplyOperation,
	hasAppliedOperation: boolean,
	hasRemovedEmptyDir: boolean,
): SkillKindApplyOperationResult {
	return {
		type: operation.type,
		path: operation.relativePath,
		...(operation.type === "skip" ? { reason: operation.reason } : {}),
		isApplied:
			operation.type === "skip"
				? false
				: operation.type === "remove-empty-dir"
					? hasRemovedEmptyDir
					: hasAppliedOperation,
	};
}

export function operationStatusesForPlans(
	plans: readonly SkillKindApplyPlan[],
	operationStatuses: readonly ProjectMutationOperationStatusRecord[],
): readonly { skill: string; operations: readonly SkillKindApplyOperationStatusResult[] }[] {
	const consumedStatusIndexes = new Set<number>();
	return plans.map((plan) => ({
		skill: plan.skill,
		operations: plan.operations.map((operation) => {
			if (operation.type === "skip")
				return {
					type: operation.type,
					path: operation.relativePath,
					description: operation.description,
					status: "skipped" as const,
				};
			const statusIndex = operationStatuses.findIndex(
				(status, index) =>
					!consumedStatusIndexes.has(index) &&
					status.type === operation.type &&
					status.path === operation.relativePath &&
					status.description === operation.description,
			);
			if (statusIndex === -1)
				return {
					type: operation.type,
					path: operation.relativePath,
					description: operation.description,
					status: "not-attempted" as const,
				};
			consumedStatusIndexes.add(statusIndex);
			return (
				operationStatuses[statusIndex] ?? {
					type: operation.type,
					path: operation.relativePath,
					description: operation.description,
					status: "not-attempted" as const,
				}
			);
		}),
	}));
}
