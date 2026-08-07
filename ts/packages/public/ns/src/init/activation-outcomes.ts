import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import { activationFileSchema } from "./activation-files.ts";

export const fileActivationOutcomeSchema = z.object({
	change: z.enum(["created", "appended", "replaced", "unchanged"]),
});

export const consumerDirectoryOutcomeSchema = z.object({
	path: z.string(),
	change: z.enum(["created", "updated", "unchanged"]),
});

export const activationCompletedSchema = z
	.object({
		files: z.partialRecord(activationFileSchema, fileActivationOutcomeSchema),
		consumerDirectories: z.array(consumerDirectoryOutcomeSchema).readonly().optional(),
	})
	.overwrite((completed) => ({
		files: completed.files,
		...optionalEntry("consumerDirectories", completed.consumerDirectories),
	}));

export type FileActivationOutcome = z.infer<typeof fileActivationOutcomeSchema>;
export type ConsumerDirectoryOutcome = z.infer<typeof consumerDirectoryOutcomeSchema>;
export type ActivationCompleted = z.infer<typeof activationCompletedSchema>;
