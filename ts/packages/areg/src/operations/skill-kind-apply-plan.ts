import { err, type Result } from "@asdl/core/result";

import type {
	AregSkillKindDeletePlan,
	AregSkillKindRemoveEmptyDirPlan,
	AregSkillKindSkillInspection,
	AregSkillKindTextWritePlan,
} from "../gateways.ts";
import { replacementAdvice, verifyPiReplacement } from "./pi-replacement.ts";
import { parsePiSettings, type PiSettingsData } from "./pi-settings.ts";
import {
	PROJECT_FILE_MUTATION_OPERATION_TYPES,
	PROJECT_MUTATION_OPERATION_TYPES,
	type ProjectMutationOperationStatusRecord,
} from "./project-mutations.ts";
import { planFrontmatterOperation } from "./skill-kind-frontmatter.ts";
import {
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
	type: "remove_empty_dir";
}

export type PlannedApplyOperation =
	| PlannedWriteOperation
	| PlannedSkipOperation
	| PlannedDeleteOperation
	| PlannedRemoveEmptyDirOperation;

export interface SkillKindApplyPlan {
	skill: string;
	kind: SkillInvocationKind;
	operations: readonly PlannedApplyOperation[];
}

export interface SkillKindApplyOperationResult {
	type: ApplyOperationType;
	path: string;
	reason?: string | undefined;
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

const MANAGED_OPENAI_POLICY = "policy:\n  allow_implicit_invocation: false\n";

export function buildSkillKindApplyPlan(
	inspection: SkillKindProjectInspection,
	skillName: string,
	kind: SkillInvocationKind,
): Result<SkillKindApplyPlan> {
	const skill = inspection.skills.find((candidate) => candidate.name === skillName);
	if (skill === undefined)
		return err({ code: "skill_not_found", message: `Local skill not found: ${skillName}` });
	const readiness = validateInspectableSkill(skill);
	if (!readiness.ok) return readiness;
	if (skill.skillMd.type !== "file")
		return err({
			code: "skill_not_found",
			message: `skills/${skill.name}/SKILL.md does not exist`,
		});
	if (kind === "command-backed") {
		const replacement = verifyPiReplacement(skill.name, inspection.replacement);
		if (!replacement.verified)
			return err({
				code: "skill_not_found",
				message: replacementAdvice(skill.name, replacement.surface),
			});
	}
	const piSettings = parsePiSettings(inspection.piDir, inspection.piSettings);
	if (!piSettings.ok) return piSettings;
	const frontmatter = planFrontmatterOperation(skill.name, skill.skillMd.text, kind);
	if (!frontmatter.ok) return frontmatter;
	const sidecar = planSidecarOperations(skill, kind);
	if (!sidecar.ok) return sidecar;
	const pi = planPiSettingsOperation(skill.name, kind, piSettings.value);
	if (!pi.ok) return pi;
	return {
		ok: true,
		value: { skill: skill.name, kind, operations: [frontmatter.value, ...sidecar.value, pi.value] },
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
	for (const operation of plan.operations) {
		if (operation.type === "write" && operation.relativePath === `skills/${skill.name}/SKILL.md`)
			skillMd = { type: "file", text: operation.content };
		if (
			operation.type === "write" &&
			operation.relativePath === `skills/${skill.name}/agents/openai.yaml`
		)
			openaiPolicy = { type: "file", text: operation.content };
		if (
			operation.type === "delete" &&
			operation.relativePath === `skills/${skill.name}/agents/openai.yaml`
		)
			openaiPolicy = { type: "missing" };
	}
	return { ...skill, skillMd, openaiPolicy };
}

export function planSidecarOperations(
	skill: AregSkillKindSkillInspection,
	kind: SkillInvocationKind,
): Result<readonly PlannedApplyOperation[]> {
	const relativePath = `skills/${skill.name}/agents/openai.yaml`;
	const agentsDir = `skills/${skill.name}/agents`;
	const shouldExist = kind === "invoke-only" || kind === "command-backed";
	if (shouldExist) {
		if (skill.openaiPolicy.type === "symlink")
			return err({
				code: "path_symlink",
				message: `${relativePath} is a symlink; refusing to manage it.`,
			});
		if (skill.openaiPolicy.type === "file") {
			if (skill.openaiPolicy.text !== MANAGED_OPENAI_POLICY)
				return err({
					code: "non_managed_openai_policy",
					message: `${relativePath} exists with non-managed content; resolve it manually before applying ${kind}.`,
				});
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
	if (skill.openaiPolicy.text !== MANAGED_OPENAI_POLICY)
		return err({
			code: "non_managed_openai_policy",
			message: `${relativePath} exists with non-managed content; resolve it manually before applying ${kind}.`,
		});
	return {
		ok: true,
		value: [
			{ type: "delete", relativePath, description: "Codex openai.yaml" },
			{
				type: "remove_empty_dir",
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
	const shouldExclude = kind === "command-backed";
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
	return plan.operations.some(
		(operation) => operation.type === "delete" || operation.type === "remove_empty_dir",
	);
}

export function deletionPrompt(plan: SkillKindApplyPlan): string {
	const paths = plan.operations
		.filter((operation) => operation.type === "delete" || operation.type === "remove_empty_dir")
		.map((operation) => `- ${operation.relativePath}`)
		.join("\n");
	return `Apply ${plan.kind} to ${plan.skill} will delete managed artifacts:\n${paths}\nContinue?`;
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

export function plannedRemoveEmptyDirs(
	plan: SkillKindApplyPlan,
): readonly AregSkillKindRemoveEmptyDirPlan[] {
	return plan.operations.flatMap((operation) =>
		operation.type === "remove_empty_dir"
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
		reason: operation.type === "skip" ? operation.reason : undefined,
		isApplied:
			operation.type === "skip"
				? false
				: operation.type === "remove_empty_dir"
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
					status: "not_attempted" as const,
				};
			consumedStatusIndexes.add(statusIndex);
			return (
				operationStatuses[statusIndex] ?? {
					type: operation.type,
					path: operation.relativePath,
					description: operation.description,
					status: "not_attempted" as const,
				}
			);
		}),
	}));
}
