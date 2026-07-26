import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	ALL_HARNESS_IDS,
	DECLARED_ARTIFACT_ACTIVATION_ACTIONS,
	HARNESS_ARTIFACT_REMOVAL_REASONS,
} from "../harness-artifacts/api.ts";
import { z } from "zod";

import { activationFileSchema } from "./activation-files.ts";

export const fileActivationOutcomeSchema = z.object({
	change: z.enum(["created", "appended", "replaced", "unchanged"]),
});

export const consumerDirectoryOutcomeSchema = z.object({
	path: z.string(),
	change: z.enum(["created", "updated", "unchanged"]),
});

export const declaredArtifactActivationOutcomeShape = {
	key: z.string(),
	action: z.enum(DECLARED_ARTIFACT_ACTIVATION_ACTIONS),
	artifactId: z.string(),
	skillName: z.string(),
	harness: z.enum(ALL_HARNESS_IDS),
	targetArtifactPath: z.string(),
	manifestPath: z.string(),
	writtenFiles: z.array(z.string()).readonly(),
	conflictingFiles: z.array(z.string()).readonly(),
	removedFiles: z.array(z.string()).readonly().optional(),
	removalReason: z.enum(HARNESS_ARTIFACT_REMOVAL_REASONS).optional(),
};

export const declaredArtifactActivationOutcomeSchema = z
	.object(declaredArtifactActivationOutcomeShape)
	.overwrite(({ removedFiles, removalReason, ...required }) => ({
		...required,
		...optionalEntry("removedFiles", removedFiles),
		...optionalEntry("removalReason", removalReason),
	}));

export const activationCompletedSchema = z
	.object({
		files: z.partialRecord(activationFileSchema, fileActivationOutcomeSchema),
		consumerDirectories: z.array(consumerDirectoryOutcomeSchema).readonly().optional(),
		artifacts: z.array(declaredArtifactActivationOutcomeSchema).readonly().optional(),
	})
	.overwrite((completed) => ({
		files: completed.files,
		...optionalEntry("consumerDirectories", completed.consumerDirectories),
		...optionalEntry("artifacts", completed.artifacts),
	}));

export type FileActivationOutcome = z.infer<typeof fileActivationOutcomeSchema>;
export type ConsumerDirectoryOutcome = z.infer<typeof consumerDirectoryOutcomeSchema>;
export type ActivationCompleted = z.infer<typeof activationCompletedSchema>;
