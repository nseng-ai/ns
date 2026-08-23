import { z } from "@nseng-ai/sdk";
import { EXPOSURE_POLICIES } from "./core.ts";

export const operationSchema = z.object({
	type: z.enum(["write", "delete", "remove-empty-dir", "skip"]),
	path: z.string(),
	outcome: z.enum(["planned", "applied", "skipped"]),
	evidence: z.string(),
});

export const applyResultSchema = z.object({
	policy: z.enum(EXPOSURE_POLICIES),
	dryRun: z.boolean(),
	skills: z.array(
		z.object({
			skill: z.string(),
			canonicalPath: z.string(),
			operations: z.array(operationSchema),
		}),
	),
	sharedOperations: z.array(
		z.object({
			type: z.literal("write-settings"),
			path: z.string(),
			outcome: z.enum(["planned", "applied", "skipped"]),
			evidence: z.string(),
		}),
	),
});

export const factsSchema = z.object({
	modelInvocationDisabled: z.boolean(),
	managedSidecar: z.boolean(),
	sidecarState: z.enum(["missing", "managed", "unexpected", "symlink"]),
	piExcluded: z.boolean(),
	replacementSurface: z.string().optional(),
	replacementVerified: z.boolean(),
});

export const showRecordSchema = z.object({
	skill: z.string(),
	canonicalPath: z.string(),
	policy: z.enum([...EXPOSURE_POLICIES, "inconsistent"]),
	facts: factsSchema,
	implications: z.array(z.string()),
	replacementEvidence: z.string(),
	diagnostics: z.array(z.string()),
});

export const showResultSchema = z.object({ skills: z.array(showRecordSchema) });
export const checkResultSchema = z.object({ ok: z.boolean(), skills: z.array(showRecordSchema) });
export const commandFailureDataSchema = z.record(z.string(), z.unknown());
export const commandUsageErrorDataSchema = z.union([
	z.object({ missingFlag: z.string(), paths: z.array(z.string()) }),
	z.object({ paths: z.array(z.string()) }),
]);

export function toShowRecord(inspection: import("./core.ts").SkillInspection) {
	return {
		skill: inspection.skill,
		canonicalPath: inspection.canonicalPath,
		policy: inspection.policy,
		facts: inspection.facts,
		implications: [...inspection.implications],
		replacementEvidence: inspection.replacementEvidence,
		diagnostics: [...inspection.diagnostics],
	};
}
