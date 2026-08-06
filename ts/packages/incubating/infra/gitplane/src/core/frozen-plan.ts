import { z } from "zod";
import { artifactClassificationSchema, artifactIdSchema } from "./artifact.ts";

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
type JsonValue = z.infer<typeof jsonPrimitiveSchema> | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

export const cursorRecordSchema = z.object({
	sourceId: z.string().min(1),
	commit: z.string().min(1),
	generation: z.number().int().positive(),
});

const currentRecordSchema = z.object({
	sourceId: z.string().min(1),
	artifactId: artifactIdSchema,
	revisionId: z.string().min(1),
	path: z.string(),
	classification: artifactClassificationSchema,
	observedCommit: z.string().min(1),
	tombstoned: z.boolean(),
});

const lineageRecordSchema = z.object({
	sourceId: z.string().min(1),
	artifactId: artifactIdSchema,
	establishedClassification: z
		.object({
			state: z.literal("classified"),
			apiVersion: z.string().min(1),
			kind: z.string().min(1),
			schemaVersion: z.number().int().positive(),
		})
		.nullable(),
	lastSchemaVersion: z.number().int().positive().nullable(),
});

const targetMappingSchema = z.object({
	table: z.string().min(1),
	lineage: z.object({
		sourceId: z.string().min(1),
		artifactId: z.string().min(1),
		revisionId: z.string().min(1),
		path: z.string().min(1),
		deleted: z.string().min(1),
		deletedAtCommit: z.string().min(1),
	}),
});

const targetRowRecordSchema = z.object({
	sourceId: z.string().min(1),
	artifactId: artifactIdSchema,
	revisionId: z.string().min(1),
	path: z.string(),
	target: targetMappingSchema,
	fields: z.array(
		z.object({
			column: z.string().min(1),
			mode: z.union([z.literal("scalar"), z.literal("json")]),
			value: jsonValueSchema,
		}),
	),
	clearFields: z.array(z.string()),
});

const eventTypeSchema = z.union([
	z.literal("artifact.created"),
	z.literal("artifact.restored"),
	z.literal("artifact.revised"),
	z.literal("artifact.deleted"),
]);

const eventRecordSchema = z.object({
	eventId: z.string().regex(/^gpe_[0-9a-z]+$/u),
	sourceId: z.string().min(1),
	artifactId: artifactIdSchema,
	reconciliationGeneration: z.number().int().positive(),
	attemptId: z.string().regex(/^gpa_[0-9a-z]+$/u),
	reconciledCommit: z.string().min(1),
	eventType: eventTypeSchema,
	priorRevisionId: z.string().nullable(),
	currentRevisionId: z.string().nullable(),
	priorPath: z.string().nullable(),
	currentPath: z.string().nullable(),
});

const frozenRevisionRecordSchema = z.object({
	sourceId: z.string().min(1),
	artifactId: artifactIdSchema,
	revisionId: z.string().min(1),
	digest: z.object({
		text: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
		bytes: z.array(z.number().int().min(0).max(255)).length(32),
		manifest: z.array(z.object({ path: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/u) })),
	}),
	envelope: jsonObjectSchema,
	firstObservedCommit: z.string().min(1),
	firstObservedPath: z.string(),
});

const frozenArtifactWorkSchema = z.object({
	artifactId: artifactIdSchema,
	outcome: eventTypeSchema,
	prior: currentRecordSchema.nullable(),
	revision: frozenRevisionRecordSchema.nullable(),
	lineage: lineageRecordSchema,
	current: currentRecordSchema,
	target: z
		.union([
			z.object({ type: z.literal("upsert"), record: targetRowRecordSchema }),
			z.object({
				type: z.literal("tombstone"),
				target: targetMappingSchema,
				deletedAtCommit: z.string().min(1),
			}),
		])
		.nullable(),
	event: eventRecordSchema,
});

export const frozenReconciliationPlanSchema = z
	.object({
		schemaVersion: z.literal(1),
		sourceId: z.string().min(1),
		attemptId: z.string().regex(/^gpa_[0-9a-z]+$/u),
		targetCommit: z.string().min(1),
		targetCommitish: z.string().min(1),
		expectedCursor: cursorRecordSchema.nullable(),
		nextCursor: cursorRecordSchema,
		artifactWork: z.array(frozenArtifactWorkSchema),
		completion: z.record(z.string(), jsonValueSchema),
	})
	.superRefine((plan, context) => {
		const expectedGeneration = plan.expectedCursor?.generation ?? 0;
		if (plan.nextCursor.generation !== expectedGeneration + 1)
			context.addIssue({
				code: "custom",
				path: ["nextCursor", "generation"],
				message: "next cursor generation must immediately follow the expected generation",
			});
		if (plan.nextCursor.sourceId !== plan.sourceId)
			context.addIssue({
				code: "custom",
				path: ["nextCursor", "sourceId"],
				message: "next cursor source must match the plan source",
			});
		if (plan.expectedCursor !== null && plan.expectedCursor.sourceId !== plan.sourceId)
			context.addIssue({
				code: "custom",
				path: ["expectedCursor", "sourceId"],
				message: "expected cursor source must match the plan source",
			});
		for (let index = 1; index < plan.artifactWork.length; index++) {
			const previousWork = plan.artifactWork[index - 1];
			const currentWork = plan.artifactWork[index];
			if (previousWork === undefined || currentWork === undefined) continue;
			if (previousWork.artifactId >= currentWork.artifactId)
				context.addIssue({
					code: "custom",
					path: ["artifactWork", index, "artifactId"],
					message: "artifact work must be uniquely ordered by artifact ID",
				});
		}
	});

export type FrozenReconciliationPlan = z.infer<typeof frozenReconciliationPlanSchema>;
export type FrozenArtifactWork = z.infer<typeof frozenArtifactWorkSchema>;
export type FrozenRevisionRecord = z.infer<typeof frozenRevisionRecordSchema>;
