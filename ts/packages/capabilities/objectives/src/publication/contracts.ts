import { z } from "zod";

const gitShaSchema = z.string().regex(/^[0-9a-f]{40}$/, "Expected a full 40-character Git SHA.");
const objectiveSlugSchema = z
	.string()
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected an Objective slug.");
const nonEmptyStringSchema = z.string().trim().min(1);

export const objectiveRunnerPublicationTargetSchema = z
	.object({
		repository: nonEmptyStringSchema,
		pullRequestNumber: z.number().int().positive(),
		branch: nonEmptyStringSchema,
		headBranch: nonEmptyStringSchema,
	})
	.strict();

export const objectiveRunnerPublicationLaunchAttestationV1Schema = z
	.object({
		version: z.literal(1),
		invocationId: nonEmptyStringSchema,
		objectiveSlug: objectiveSlugSchema,
		policyAttested: z.literal(true),
		launchConfirmed: z.literal(true),
		target: objectiveRunnerPublicationTargetSchema,
		launchHead: gitShaSchema,
		remoteHead: gitShaSchema,
	})
	.strict();

export type ObjectiveRunnerPublicationLaunchAttestationV1 = z.infer<
	typeof objectiveRunnerPublicationLaunchAttestationV1Schema
>;

export const objectiveRunnerPublicationAuthorizationV1Schema =
	objectiveRunnerPublicationLaunchAttestationV1Schema
		.omit({ remoteHead: true })
		.extend({ lastPublishedHead: gitShaSchema })
		.strict();

export type ObjectiveRunnerPublicationAuthorizationV1 = z.infer<
	typeof objectiveRunnerPublicationAuthorizationV1Schema
>;

export const objectiveRunnerValidationOutcomeSchema = z
	.object({
		command: nonEmptyStringSchema,
		result: z.enum(["passed", "failed"]),
		detail: nonEmptyStringSchema.optional(),
	})
	.strict();

export const objectiveRunnerPublishedStepSchema = z
	.object({
		runnerCommitSha: gitShaSchema,
		validation: z.array(objectiveRunnerValidationOutcomeSchema).min(1),
		decisions: z.array(nonEmptyStringSchema),
	})
	.strict();

export const objectiveRunnerTrackingCommitSchema = z
	.object({
		sha: gitShaSchema,
		subject: nonEmptyStringSchema,
	})
	.strict();

export const objectiveRunnerCumulativeSummaryV1Schema = z
	.object({
		version: z.literal(1),
		objectiveSlug: objectiveSlugSchema,
		publishedHead: gitShaSchema,
		steps: z.array(objectiveRunnerPublishedStepSchema).min(1),
		objectiveTrackingCommits: z.array(objectiveRunnerTrackingCommitSchema),
	})
	.strict();

export type ObjectiveRunnerCumulativeSummaryV1 = z.infer<
	typeof objectiveRunnerCumulativeSummaryV1Schema
>;

export const publicationTargetFactsSchema = z
	.object({
		repository: nonEmptyStringSchema,
		branch: nonEmptyStringSchema,
		isTrunk: z.boolean(),
		localHead: gitShaSchema,
		isWorktreeClean: z.boolean(),
		pullRequest: z
			.object({
				number: z.number().int().positive(),
				headBranch: nonEmptyStringSchema,
				headSha: gitShaSchema,
			})
			.strict()
			.nullable(),
	})
	.strict();

export type PublicationTargetFacts = z.infer<typeof publicationTargetFactsSchema>;

export const publicationCommitFactsSchema = z
	.object({
		lastPublishedHead: gitShaSchema,
		intendedPublishedHead: gitShaSchema,
		isLastPublishedHeadAncestor: z.boolean(),
		commits: z.array(
			z
				.object({
					sha: gitShaSchema,
					objectiveRunnerStepTrailers: z.array(objectiveSlugSchema),
				})
				.strict(),
		),
	})
	.strict();

export type PublicationCommitFacts = z.infer<typeof publicationCommitFactsSchema>;

export const objectiveRunnerPublicationCheckpointSchema = z
	.object({
		isVerified: z.boolean(),
		runnerCommitShas: z.array(gitShaSchema).min(1),
		objectiveTrackingCommitShas: z.array(gitShaSchema),
	})
	.strict();

export type ObjectiveRunnerPublicationCheckpoint = z.infer<
	typeof objectiveRunnerPublicationCheckpointSchema
>;
