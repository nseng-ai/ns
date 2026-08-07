import { z } from "zod";
import { artifactClassificationSchema, artifactIdSchema } from "./artifact.ts";
import type {
	ArtifactCurrentRecord,
	ArtifactLineageRecord,
	CursorRecord,
	EventRecord,
	RevisionRecord,
	TargetRowRecord,
} from "./gateways.ts";
import { deriveEventId } from "./identity.ts";

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = z.infer<typeof jsonPrimitiveSchema> | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
const nonNegativeCountSchema = z.number().int().nonnegative();

const compactCursorSchema = z
	.object({
		commit: z.string().min(1),
		generation: z.number().int().positive(),
	})
	.strict();

const targetMappingSchema = z
	.object({
		table: z.string().min(1),
		lineage: z
			.object({
				sourceId: z.string().min(1),
				artifactId: z.string().min(1),
				revisionId: z.string().min(1),
				path: z.string().min(1),
				deleted: z.string().min(1),
				deletedAtCommit: z.string().min(1),
			})
			.strict(),
	})
	.strict();

const lineageSchema = z
	.object({
		establishedClassification: z
			.object({
				state: z.literal("classified"),
				apiVersion: z.string().min(1),
				kind: z.string().min(1),
				schemaVersion: z.number().int().positive(),
			})
			.strict()
			.nullable(),
		lastSchemaVersion: z.number().int().positive().nullable(),
	})
	.strict();

const priorArtifactSchema = z
	.object({
		revisionId: z.string().min(1),
		path: z.string(),
		classification: artifactClassificationSchema,
	})
	.strict();

const plannedRevisionSchema = z
	.object({
		revisionId: z.string().min(1),
		digest: z
			.object({
				text: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
				bytes: z.array(z.number().int().min(0).max(255)).length(32),
				manifest: z.array(
					z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/u) }).strict(),
				),
			})
			.strict(),
		envelope: jsonObjectSchema,
	})
	.strict();

const targetUpsertSchema = z
	.object({
		type: z.literal("upsert"),
		mapping: targetMappingSchema,
		fields: z.array(
			z
				.object({
					column: z.string().min(1),
					mode: z.union([z.literal("scalar"), z.literal("json")]),
					value: jsonValueSchema,
				})
				.strict(),
		),
		clearFields: z.array(z.string()),
	})
	.strict();

const plannedLiveArtifactMaterializationSchema = z
	.object({
		artifactId: artifactIdSchema,
		outcome: z.union([
			z.literal("artifact.created"),
			z.literal("artifact.restored"),
			z.literal("artifact.revised"),
		]),
		prior: priorArtifactSchema.nullable(),
		revision: plannedRevisionSchema,
		path: z.string(),
		classification: artifactClassificationSchema,
		lineage: lineageSchema,
		target: targetUpsertSchema.nullable(),
	})
	.strict()
	.superRefine((materialization, context) => {
		if (materialization.outcome === "artifact.created" && materialization.prior !== null)
			context.addIssue({
				code: "custom",
				path: ["prior"],
				message: "created artifact materialization cannot have prior state",
			});
		if (materialization.outcome !== "artifact.created" && materialization.prior === null)
			context.addIssue({
				code: "custom",
				path: ["prior"],
				message: `${materialization.outcome} artifact materialization requires prior state`,
			});
		if (materialization.classification.state === "generic" && materialization.target !== null)
			context.addIssue({
				code: "custom",
				path: ["target"],
				message: "generic artifact materialization cannot include a target operation",
			});
	});

const plannedDeletedArtifactMaterializationSchema = z
	.object({
		artifactId: artifactIdSchema,
		outcome: z.literal("artifact.deleted"),
		prior: priorArtifactSchema,
		lineage: lineageSchema,
		target: z
			.object({ type: z.literal("tombstone"), mapping: targetMappingSchema })
			.strict()
			.nullable(),
	})
	.strict();

const plannedArtifactMaterializationSchema = z.union([
	plannedLiveArtifactMaterializationSchema,
	plannedDeletedArtifactMaterializationSchema,
]);

export const reconciliationPlanSchema = z
	.object({
		schemaVersion: z.literal(1),
		sourceId: z.string().min(1),
		attemptId: z.string().regex(/^gpa_[0-9a-z]+$/u),
		targetCommit: z.string().min(1),
		targetCommitish: z.string().min(1),
		expectedCursor: compactCursorSchema.nullable(),
		artifactMaterialization: z.array(plannedArtifactMaterializationSchema),
		completion: z
			.object({
				created: nonNegativeCountSchema,
				restored: nonNegativeCountSchema,
				revised: nonNegativeCountSchema,
				unchanged: nonNegativeCountSchema,
				deleted: nonNegativeCountSchema,
			})
			.strict(),
	})
	.strict()
	.superRefine((plan, context) => {
		for (let index = 1; index < plan.artifactMaterialization.length; index++) {
			const previous = plan.artifactMaterialization[index - 1];
			const current = plan.artifactMaterialization[index];
			if (previous === undefined || current === undefined) continue;
			if (previous.artifactId >= current.artifactId)
				context.addIssue({
					code: "custom",
					path: ["artifactMaterialization", index, "artifactId"],
					message: "planned artifact materialization must be uniquely ordered by artifact ID",
				});
		}
		const outcomeCounts = {
			created: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.created",
			).length,
			restored: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.restored",
			).length,
			revised: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.revised",
			).length,
			deleted: plan.artifactMaterialization.filter(
				(materialization) => materialization.outcome === "artifact.deleted",
			).length,
		};
		for (const outcome of ["created", "restored", "revised", "deleted"] as const)
			if (plan.completion[outcome] !== outcomeCounts[outcome])
				context.addIssue({
					code: "custom",
					path: ["completion", outcome],
					message: `${outcome} completion count must match planned artifact materialization`,
				});
	});

export type ReconciliationPlan = z.infer<typeof reconciliationPlanSchema>;
export type PlannedArtifactMaterialization = z.infer<typeof plannedArtifactMaterializationSchema>;

export type PreparedArtifactMaterialization = {
	readonly revision: RevisionRecord | null;
	readonly lineage: ArtifactLineageRecord;
	readonly current: ArtifactCurrentRecord;
	readonly target:
		| { readonly type: "upsert"; readonly record: TargetRowRecord }
		| {
				readonly type: "tombstone";
				readonly sourceId: string;
				readonly artifactId: PlannedArtifactMaterialization["artifactId"];
				readonly target: NonNullable<PlannedArtifactMaterialization["target"]>["mapping"];
				readonly deletedAtCommit: string;
		  }
		| null;
	readonly event: EventRecord;
};

export function parseReconciliationPlan(input: unknown): ReconciliationPlan {
	return reconciliationPlanSchema.parse(input);
}

export function prepareResultingCursor(plan: ReconciliationPlan): CursorRecord {
	return {
		sourceId: plan.sourceId,
		commit: plan.targetCommit,
		generation: (plan.expectedCursor?.generation ?? 0) + 1,
	};
}

export function prepareArtifactMaterialization(
	plan: ReconciliationPlan,
	planned: PlannedArtifactMaterialization,
): PreparedArtifactMaterialization {
	const resultingCursor = prepareResultingCursor(plan);
	const lineage: ArtifactLineageRecord = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		...planned.lineage,
	};
	if (planned.outcome === "artifact.deleted") {
		const current: ArtifactCurrentRecord = {
			sourceId: plan.sourceId,
			artifactId: planned.artifactId,
			...planned.prior,
			observedCommit: plan.targetCommit,
			tombstoned: true,
		};
		return {
			revision: null,
			lineage,
			current,
			target:
				planned.target === null
					? null
					: {
							type: "tombstone",
							sourceId: plan.sourceId,
							artifactId: planned.artifactId,
							target: planned.target.mapping,
							deletedAtCommit: plan.targetCommit,
						},
			event: prepareEvent(plan, planned, resultingCursor.generation, null, null),
		};
	}
	const revision: RevisionRecord = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		revisionId: planned.revision.revisionId,
		digest: {
			...planned.revision.digest,
			text: planned.revision.digest.text as `sha256:${string}`,
			bytes: Uint8Array.from(planned.revision.digest.bytes),
		},
		envelope: planned.revision.envelope,
		firstObservedCommit: plan.targetCommit,
		firstObservedPath: planned.path,
	};
	const current: ArtifactCurrentRecord = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		revisionId: planned.revision.revisionId,
		path: planned.path,
		classification: planned.classification,
		observedCommit: plan.targetCommit,
		tombstoned: false,
	};
	return {
		revision,
		lineage,
		current,
		target:
			planned.target === null
				? null
				: {
						type: "upsert",
						record: {
							sourceId: plan.sourceId,
							artifactId: planned.artifactId,
							revisionId: planned.revision.revisionId,
							path: planned.path,
							target: planned.target.mapping,
							fields: planned.target.fields,
							clearFields: planned.target.clearFields,
						},
					},
		event: prepareEvent(
			plan,
			planned,
			resultingCursor.generation,
			planned.revision.revisionId,
			planned.path,
		),
	};
}

function prepareEvent(
	plan: ReconciliationPlan,
	planned: PlannedArtifactMaterialization,
	reconciliationGeneration: number,
	currentRevisionId: string | null,
	currentPath: string | null,
): EventRecord {
	const eventIdentity = {
		sourceId: plan.sourceId,
		artifactId: planned.artifactId,
		reconciliationGeneration,
		attemptId: plan.attemptId,
		reconciledCommit: plan.targetCommit,
		eventType: planned.outcome,
	};
	return {
		eventId: deriveEventId(eventIdentity),
		...eventIdentity,
		priorRevisionId: planned.prior?.revisionId ?? null,
		currentRevisionId,
		priorPath: planned.prior?.path ?? null,
		currentPath,
	};
}
