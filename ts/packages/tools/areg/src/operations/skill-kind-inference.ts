import { err, type Result } from "@nseng-ai/foundation/result";

import type { AregSkillKindSkillInspection } from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import {
	parseSkillFrontmatterBlock,
	type SkillFrontmatterData,
} from "@nseng-ai/harness-artifacts/api";
import {
	formatReplacementLabel,
	replacementAdvice,
	verifyPiReplacement,
	type PiReplacementVerification,
} from "./pi-replacement.ts";
import { parsePiSettings } from "./pi-settings.ts";
import type { AregSkillKindProjectInspection } from "./project-inspection.ts";

export const SKILL_INVOCATION_KINDS = [
	"normal",
	"invoke-only",
	"command-backed",
	"ambient-only",
	"unlisted",
] as const;
export const INFERRED_SKILL_INVOCATION_KINDS = [
	...SKILL_INVOCATION_KINDS,
	"mixed",
	"inconsistent",
] as const;
export const MODEL_INVOCATION_STATUSES = ["enabled", "disabled", "mixed"] as const;
export const NATIVE_DIRECT_STATUSES = ["enabled", "partial", "hidden", "mixed"] as const;
export const PI_EXTENSION_STATUSES = ["n/a", "enabled", "excluded", "missing"] as const;
export const DISABLE_MODEL_INVOCATION_KEY = "disable-model-invocation";
export const USER_INVOCABLE_KEY = "user-invocable";
export const MANAGED_OPENAI_POLICY = "policy:\n  allow_implicit_invocation: false\n";
const LEGACY_BARE_OPENAI_POLICY = "allow_implicit_invocation: false\n";

export type SkillInvocationKind = (typeof SKILL_INVOCATION_KINDS)[number];
export type InferredSkillInvocationKind = (typeof INFERRED_SKILL_INVOCATION_KINDS)[number];
export type ModelInvocationStatus = (typeof MODEL_INVOCATION_STATUSES)[number];
export type NativeDirectStatus = (typeof NATIVE_DIRECT_STATUSES)[number];
export type PiExtensionStatus = (typeof PI_EXTENSION_STATUSES)[number];

export interface SkillKindProperties {
	shouldDisableModelInvocation: boolean;
	hasCodexSidecar: boolean;
	isPiExcluded: boolean;
}

export const KIND_PROPERTIES: Record<SkillInvocationKind, SkillKindProperties> = {
	normal: {
		shouldDisableModelInvocation: false,
		hasCodexSidecar: false,
		isPiExcluded: false,
	},
	"invoke-only": {
		shouldDisableModelInvocation: true,
		hasCodexSidecar: true,
		isPiExcluded: false,
	},
	"command-backed": {
		shouldDisableModelInvocation: true,
		hasCodexSidecar: true,
		isPiExcluded: true,
	},
	"ambient-only": {
		shouldDisableModelInvocation: false,
		hasCodexSidecar: false,
		isPiExcluded: false,
	},
	unlisted: {
		shouldDisableModelInvocation: true,
		hasCodexSidecar: true,
		isPiExcluded: true,
	},
};

export interface SkillKindArtifactFacts {
	isModelInvocationDisabled: boolean;
	hasCodexSidecar: boolean;
	hasUserInvocableKey: boolean;
	isUserInvocableFalse: boolean;
	isPiExcluded: boolean;
	hasAgentsMirror: boolean;
	hasClaudeMirror: boolean;
}

export interface SkillKindReplacementInfo {
	verified: boolean;
	surface?: string;
	label: string;
	evidence?: string;
	advice?: string;
}

export interface SkillKindRecord {
	skill: string;
	kind: InferredSkillInvocationKind;
	modelInvocation: ModelInvocationStatus;
	nativeDirect: NativeDirectStatus;
	piExtension: PiExtensionStatus;
	artifacts: SkillKindArtifactFacts;
	replacement: SkillKindReplacementInfo;
	notes: readonly string[];
}

export type SkillKindProjectInspection = AregSkillKindProjectInspection;
export type FrontmatterInspection = SkillFrontmatterData;

export function inspectSkillFrontmatter(
	text: string,
	pathLabel: string,
): Result<FrontmatterInspection> {
	const parsed = parseSkillFrontmatterBlock(text);
	if (!parsed.ok)
		return {
			ok: false,
			error: { ...parsed.error, message: `${pathLabel} ${parsed.error.message}` },
		};
	return parsed;
}

export function inferSkillKindRecord(options: {
	skillName: string;
	frontmatter: FrontmatterInspection;
	hasCodexSidecar: boolean;
	isPiExcluded: boolean;
	hasAgentsMirror: boolean;
	hasClaudeMirror: boolean;
	replacement: PiReplacementVerification;
}): SkillKindRecord {
	const isModelInvocationDisabled = truthyFrontmatterValue(
		options.frontmatter.fields[DISABLE_MODEL_INVOCATION_KEY],
	);
	const hasUserInvocableKey = options.frontmatter.keys.has(USER_INVOCABLE_KEY);
	const isUserInvocableFalse = falsyFrontmatterValue(
		options.frontmatter.fields[USER_INVOCABLE_KEY],
	);
	const artifacts: SkillKindArtifactFacts = {
		isModelInvocationDisabled,
		hasCodexSidecar: options.hasCodexSidecar,
		hasUserInvocableKey,
		isUserInvocableFalse,
		isPiExcluded: options.isPiExcluded,
		hasAgentsMirror: options.hasAgentsMirror,
		hasClaudeMirror: options.hasClaudeMirror,
	};
	const kind = inferKind(artifacts, options.replacement);
	const replacementEvidenceText = options.replacement.verified
		? replacementEvidence(options.replacement)
		: undefined;
	const replacementAdviceText = options.replacement.verified
		? undefined
		: replacementAdvice(options.skillName, options.replacement.surface);
	const replacement: SkillKindReplacementInfo = {
		verified: options.replacement.verified,
		...(options.replacement.surface === undefined ? {} : { surface: options.replacement.surface }),
		label: formatReplacementLabel(options.replacement),
		...(replacementEvidenceText === undefined ? {} : { evidence: replacementEvidenceText }),
		...(replacementAdviceText === undefined ? {} : { advice: replacementAdviceText }),
	};
	return {
		skill: options.skillName,
		kind,
		modelInvocation: modelInvocationStatus(artifacts),
		nativeDirect: nativeDirectStatus(kind, artifacts),
		piExtension: piExtensionStatus(kind, artifacts, options.replacement),
		artifacts,
		replacement,
		notes: buildNotes({
			skillName: options.skillName,
			kind,
			artifacts,
			userInvocableValue: options.frontmatter.fields[USER_INVOCABLE_KEY],
			replacement: options.replacement,
		}),
	};
}

export function isManagedOpenaiPolicyContent(text: string): boolean {
	return text === MANAGED_OPENAI_POLICY;
}

export function isLegacyBareOpenaiPolicyContent(text: string): boolean {
	return text === LEGACY_BARE_OPENAI_POLICY;
}

export function buildSkillKindRecords(
	inspection: SkillKindProjectInspection,
): Result<readonly SkillKindRecord[]> {
	const piSettings = parsePiSettings(inspection.piDir, inspection.piSettings);
	if (!piSettings.ok) return piSettings;
	const records: SkillKindRecord[] = [];
	for (const skill of sortSkills(inspection.skills)) {
		const readiness = validateInspectableSkill(skill);
		if (!readiness.ok) return readiness;
		if (skill.skillMd.type !== "file")
			return err({
				code: "skill_not_found",
				message: `${skill.baseRelativePath}/SKILL.md does not exist`,
			});
		const frontmatter = inspectSkillFrontmatter(
			skill.skillMd.text,
			`${skill.baseRelativePath}/SKILL.md`,
		);
		if (!frontmatter.ok) return frontmatter;
		const replacement = verifyPiReplacement(skill.name, inspection.replacement);
		records.push(
			inferSkillKindRecord({
				skillName: skill.name,
				frontmatter: frontmatter.value,
				hasCodexSidecar: skill.openaiPolicy.type === "file",
				isPiExcluded: piSettings.value.exclusions.includes(`-skills/${skill.name}`),
				hasAgentsMirror: skill.agentsPath.type !== "missing",
				hasClaudeMirror: skill.claudePath.type !== "missing",
				replacement,
			}),
		);
	}
	return { ok: true, value: records };
}

export function validateInspectableSkill(skill: AregSkillKindSkillInspection): Result<undefined> {
	if (skill.skillDir.type === "symlink")
		return err({
			code: "path_symlink",
			message: `${skill.baseRelativePath} is a symlink; refusing to manage invocation metadata`,
		});
	if (skill.skillDir.type !== "directory")
		return err({
			code: "skill_not_found",
			message: `Managed skill missing source: ${skill.baseRelativePath}/ does not exist`,
		});
	if (skill.skillMd.type === "symlink")
		return err({
			code: "path_symlink",
			message: `${skill.baseRelativePath}/SKILL.md is a symlink; refusing to manage invocation metadata`,
		});
	if (skill.skillMd.type !== "file")
		return err({
			code: "skill_not_found",
			message: `${skill.baseRelativePath}/SKILL.md does not exist`,
		});
	return { ok: true, value: undefined };
}

function inferKind(
	artifacts: SkillKindArtifactFacts,
	replacement: PiReplacementVerification,
): InferredSkillInvocationKind {
	if (
		artifacts.isModelInvocationDisabled &&
		artifacts.hasCodexSidecar &&
		artifacts.isPiExcluded &&
		replacement.verified &&
		!artifacts.hasUserInvocableKey
	)
		return "command-backed";
	if (
		isUnlistedCandidate(artifacts, replacement.surface) &&
		artifacts.isPiExcluded &&
		!artifacts.hasAgentsMirror &&
		!artifacts.hasClaudeMirror
	)
		return "unlisted";
	if (
		artifacts.isModelInvocationDisabled &&
		artifacts.hasCodexSidecar &&
		!artifacts.isPiExcluded &&
		!artifacts.hasUserInvocableKey
	)
		return "invoke-only";
	if (
		artifacts.isUserInvocableFalse &&
		!artifacts.isModelInvocationDisabled &&
		!artifacts.hasCodexSidecar &&
		!artifacts.isPiExcluded
	)
		return "ambient-only";
	if (
		!artifacts.isModelInvocationDisabled &&
		!artifacts.hasCodexSidecar &&
		!artifacts.hasUserInvocableKey &&
		!artifacts.isPiExcluded
	)
		return "normal";
	if (
		artifacts.hasUserInvocableKey &&
		(artifacts.isModelInvocationDisabled || artifacts.hasCodexSidecar || artifacts.isPiExcluded)
	)
		return "mixed";
	return "inconsistent";
}

export function isUnlistedCandidate(
	artifacts: SkillKindArtifactFacts,
	replacementSurface: string | undefined,
): boolean {
	return (
		artifacts.isModelInvocationDisabled &&
		artifacts.hasCodexSidecar &&
		!artifacts.hasUserInvocableKey &&
		replacementSurface === undefined
	);
}

function modelInvocationStatus(artifacts: SkillKindArtifactFacts): ModelInvocationStatus {
	if (artifacts.isModelInvocationDisabled && artifacts.hasCodexSidecar) return "disabled";
	if (artifacts.isModelInvocationDisabled || artifacts.hasCodexSidecar) return "mixed";
	return "enabled";
}

function nativeDirectStatus(
	kind: InferredSkillInvocationKind,
	artifacts: SkillKindArtifactFacts,
): NativeDirectStatus {
	if (kind === "normal" || kind === "invoke-only") return "enabled";
	if (kind === "unlisted") return "hidden";
	if (kind === "command-backed" || kind === "ambient-only") return "partial";
	if (artifacts.hasUserInvocableKey || artifacts.isPiExcluded) return "mixed";
	return "enabled";
}

function piExtensionStatus(
	kind: InferredSkillInvocationKind,
	artifacts: SkillKindArtifactFacts,
	replacement: PiReplacementVerification,
): PiExtensionStatus {
	if (!artifacts.isPiExcluded) return "n/a";
	if (kind === "unlisted") return "excluded";
	return replacement.verified ? "enabled" : "missing";
}

function buildNotes(options: {
	skillName: string;
	kind: InferredSkillInvocationKind;
	artifacts: SkillKindArtifactFacts;
	userInvocableValue: string | undefined;
	replacement: PiReplacementVerification;
}): readonly string[] {
	const notes: string[] = [];
	if (options.artifacts.isModelInvocationDisabled && !options.artifacts.hasCodexSidecar)
		notes.push("disable-model-invocation is present but agents/openai.yaml is missing.");
	if (options.artifacts.hasCodexSidecar && !options.artifacts.isModelInvocationDisabled)
		notes.push("agents/openai.yaml is present but disable-model-invocation is absent.");
	if (options.artifacts.hasUserInvocableKey && !options.artifacts.isUserInvocableFalse)
		notes.push(
			`user-invocable is present with value ${JSON.stringify(options.userInvocableValue ?? "")}, not false.`,
		);
	if (
		options.artifacts.isUserInvocableFalse &&
		(options.artifacts.isModelInvocationDisabled ||
			options.artifacts.hasCodexSidecar ||
			options.artifacts.isPiExcluded)
	) {
		notes.push("user-invocable:false is mixed with explicit-only or Pi-exclusion artifacts.");
	}
	if (
		options.artifacts.isPiExcluded &&
		!options.replacement.verified &&
		options.kind !== "unlisted"
	)
		notes.push("Pi skill exclusion is present without a verified replacement command.");
	if (options.kind === "unlisted")
		notes.push(
			`unlisted hides this skill from all harness typeaheads; canonical source remains skills/${options.skillName}/.`,
		);
	if (options.kind === "ambient-only")
		notes.push(
			"ambient-only disables Claude native direct invocation; Pi and Codex native direct invocation are not enforced.",
		);
	return notes;
}

function truthyFrontmatterValue(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "true";
}

function falsyFrontmatterValue(value: string | undefined): boolean {
	return value?.trim().toLowerCase() === "false";
}

function replacementEvidence(replacement: PiReplacementVerification): string | undefined {
	return replacement.surface === undefined ? "replacement verified" : `/${replacement.surface}`;
}

function sortSkills(
	skills: readonly AregSkillKindSkillInspection[],
): readonly AregSkillKindSkillInspection[] {
	const byName = new Map(skills.map((skill) => [skill.name, skill]));
	return sortStrings([...byName.keys()])
		.map((name) => byName.get(name))
		.filter((skill): skill is AregSkillKindSkillInspection => skill !== undefined);
}
