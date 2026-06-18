import { err, type Result } from "@asdl/core/result";

import type { AregSkillKindSkillInspection } from "../gateways.ts";
import { sortStrings } from "../sort.ts";
import { parseSkillFrontmatterBlock, type SkillFrontmatterData } from "./frontmatter.ts";
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
] as const;
export const INFERRED_SKILL_INVOCATION_KINDS = [
	...SKILL_INVOCATION_KINDS,
	"mixed",
	"inconsistent",
] as const;
export const MODEL_INVOCATION_STATUSES = ["enabled", "disabled", "mixed"] as const;
export const NATIVE_DIRECT_STATUSES = ["enabled", "partial", "mixed"] as const;
export const PI_EXTENSION_STATUSES = ["n/a", "enabled", "missing"] as const;
export const DISABLE_MODEL_INVOCATION_KEY = "disable-model-invocation";
export const USER_INVOCABLE_KEY = "user-invocable";

export type SkillInvocationKind = (typeof SKILL_INVOCATION_KINDS)[number];
export type InferredSkillInvocationKind = (typeof INFERRED_SKILL_INVOCATION_KINDS)[number];
export type ModelInvocationStatus = (typeof MODEL_INVOCATION_STATUSES)[number];
export type NativeDirectStatus = (typeof NATIVE_DIRECT_STATUSES)[number];
export type PiExtensionStatus = (typeof PI_EXTENSION_STATUSES)[number];

export interface SkillKindArtifactFacts {
	isModelInvocationDisabled: boolean;
	hasCodexSidecar: boolean;
	hasUserInvocableKey: boolean;
	isUserInvocableFalse: boolean;
	isPiExcluded: boolean;
}

export interface SkillKindReplacementInfo {
	verified: boolean;
	surface?: string | undefined;
	label: string;
	evidence?: string | undefined;
	advice?: string | undefined;
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
	};
	const kind = inferKind(artifacts, options.replacement);
	const replacement: SkillKindReplacementInfo = {
		verified: options.replacement.verified,
		surface: options.replacement.surface,
		label: formatReplacementLabel(options.replacement),
		evidence: options.replacement.verified ? replacementEvidence(options.replacement) : undefined,
		advice: options.replacement.verified
			? undefined
			: replacementAdvice(options.skillName, options.replacement.surface),
	};
	return {
		skill: options.skillName,
		kind,
		modelInvocation: modelInvocationStatus(artifacts),
		nativeDirect: nativeDirectStatus(kind, artifacts),
		piExtension: piExtensionStatus(artifacts, options.replacement),
		artifacts,
		replacement,
		notes: buildNotes({
			kind,
			artifacts,
			userInvocableValue: options.frontmatter.fields[USER_INVOCABLE_KEY],
			replacement: options.replacement,
		}),
	};
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
				message: `skills/${skill.name}/SKILL.md does not exist`,
			});
		const frontmatter = inspectSkillFrontmatter(
			skill.skillMd.text,
			`skills/${skill.name}/SKILL.md`,
		);
		if (!frontmatter.ok) return frontmatter;
		const replacement = verifyPiReplacement(skill.name, inspection.replacement);
		records.push(
			inferSkillKindRecord({
				skillName: skill.name,
				frontmatter: frontmatter.value,
				hasCodexSidecar: skill.openaiPolicy.type === "file",
				isPiExcluded: piSettings.value.exclusions.includes(`-skills/${skill.name}`),
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
			message: `skills/${skill.name} is a symlink but should be a real directory (canonical source)`,
		});
	if (skill.skillDir.type !== "directory")
		return err({
			code: "skill_not_found",
			message: `Local skill missing canonical source: skills/${skill.name}/ does not exist`,
		});
	if (skill.skillMd.type === "symlink")
		return err({
			code: "path_symlink",
			message: `skills/${skill.name}/SKILL.md is a symlink but should be a real file (canonical source)`,
		});
	if (skill.skillMd.type !== "file")
		return err({
			code: "skill_not_found",
			message: `skills/${skill.name}/SKILL.md does not exist`,
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
	if (kind === "command-backed" || kind === "ambient-only") return "partial";
	if (artifacts.hasUserInvocableKey || artifacts.isPiExcluded) return "mixed";
	return "enabled";
}

function piExtensionStatus(
	artifacts: SkillKindArtifactFacts,
	replacement: PiReplacementVerification,
): PiExtensionStatus {
	if (!artifacts.isPiExcluded) return "n/a";
	return replacement.verified ? "enabled" : "missing";
}

function buildNotes(options: {
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
	if (options.artifacts.isPiExcluded && !options.replacement.verified)
		notes.push("Pi skill exclusion is present without a verified replacement command.");
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
