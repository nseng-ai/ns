import { failure, negative, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { z } from "zod";

import {
	absoluteAtFileSchema,
	absoluteAtPath,
	atFileSchema,
	parseJson,
	readJsonInput,
} from "../../../../ns/at-file-inputs.ts";
import { objectiveNsCommandWithContext } from "../../../../ns/objective-command.ts";
import {
	createNsObjectiveRunnerPublicationContext,
	type ObjectiveRunnerPublicationCommandContext,
} from "../../../../ns/publication-context.ts";
import { publishObjectiveRunnerCheckpoint } from "../../../../publication/publish.ts";

export const publicationPublishRequestSchema = z.object({
	invocationId: z.string().min(1),
	objectiveSlug: z.string().min(1),
	authorization: absoluteAtFileSchema,
	summary: atFileSchema,
	checkpoint: atFileSchema,
});

const publicationErrorSchema = z.object({
	code: z.string(),
	message: z.string(),
	displayCommand: z.string().optional(),
});

export const publicationPublishResultSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("refused"),
		code: z.string(),
		authorizationPath: z.string().optional(),
	}),
	z.object({
		type: z.literal("publication-refused"),
		reason: z.string(),
		error: publicationErrorSchema,
	}),
	z.object({ type: z.literal("push-failed"), error: publicationErrorSchema }),
	z.object({
		type: z.literal("published"),
		headSha: z.string(),
		authorizationPath: z.string(),
	}),
	z.object({
		type: z.literal("pushed-pr-update-failed"),
		headSha: z.string(),
		authorizationPath: z.string(),
		error: publicationErrorSchema,
	}),
	z.object({
		type: z.literal("pushed-but-authorization-update-failed"),
		headSha: z.string(),
		authorizationPath: z.string(),
		publicationType: z.enum(["published", "pushed-pr-update-failed"]),
		error: publicationErrorSchema,
		prUpdateError: publicationErrorSchema.optional(),
	}),
]);

export type PublicationPublishRequest = z.infer<typeof publicationPublishRequestSchema>;
export type PublicationPublishResult = z.infer<typeof publicationPublishResultSchema>;

export async function runPublicationPublish(
	ctx: ObjectiveRunnerPublicationCommandContext,
	request: PublicationPublishRequest,
): Promise<
	ClinkrExit<
		PublicationPublishResult,
		PublicationPublishResult,
		PublicationPublishResult,
		{ readonly argument: string }
	>
> {
	const authorizationPath = absoluteAtPath(ctx.cwd, request.authorization);
	const authorizationRead = await ctx.authorizations.read(authorizationPath);
	if (!authorizationRead.ok) {
		return failure(authorizationRead.error.code, authorizationRead.error.message, {
			type: "refused",
			code: authorizationRead.error.code,
			authorizationPath,
		});
	}
	const authorization = parseJson(authorizationRead.value);
	if (!authorization.ok) {
		return usageError("Publication authorization file is not valid JSON.", {
			argument: "authorization",
		});
	}
	const summary = await readJsonInput(ctx, request.summary, "summary");
	if (!summary.ok) return summary.exit;
	const checkpoint = await readJsonInput(ctx, request.checkpoint, "checkpoint");
	if (!checkpoint.ok) return checkpoint.exit;

	const result = await publishObjectiveRunnerCheckpoint(ctx.facts, ctx.publisher, {
		repoRoot: ctx.repoRoot,
		invocationId: request.invocationId,
		objectiveSlug: request.objectiveSlug,
		authorization: authorization.value,
		summary: summary.value,
		checkpoint: checkpoint.value,
	});
	if (result.type === "refused") {
		return negative(result.message, { type: result.type, code: result.code });
	}
	if (result.type === "publication-refused") {
		return negative(result.error.message, {
			type: result.type,
			reason: result.reason,
			error: result.error,
		});
	}
	if (result.type === "push-failed") {
		return failure("publication-push-failed", result.error.message, {
			type: result.type,
			error: result.error,
		});
	}

	const replaced = await ctx.authorizations.replace(
		authorizationPath,
		`${JSON.stringify(result.nextAuthorization, null, 2)}\n`,
	);
	if (!replaced.ok) {
		const outcome: PublicationPublishResult = {
			type: "pushed-but-authorization-update-failed",
			headSha: result.headSha,
			authorizationPath,
			publicationType: result.type,
			error: replaced.error,
			...(result.type === "pushed-pr-update-failed" ? { prUpdateError: result.error } : {}),
		};
		return failure(outcome.type, replaced.error.message, outcome);
	}
	if (result.type === "pushed-pr-update-failed") {
		return ok({
			type: result.type,
			headSha: result.headSha,
			authorizationPath,
			error: result.error,
		});
	}
	return ok({ type: "published", headSha: result.headSha, authorizationPath });
}

export async function command(
	createContext?: (
		api: NsExtensionApi,
	) => Promise<ObjectiveRunnerPublicationCommandContext> | ObjectiveRunnerPublicationCommandContext,
) {
	return objectiveNsCommandWithContext({
		schema: publicationPublishRequestSchema,
		resultSchema: publicationPublishResultSchema,
		negativeSchema: publicationPublishResultSchema,
		failureSchema: publicationPublishResultSchema,
		usageErrorSchema: z.any(),
		createContext: createContext ?? createNsObjectiveRunnerPublicationContext,
		handler: runPublicationPublish,
		renderHuman: (result) => {
			if (result.type === "published") return `Published ${result.headSha}.`;
			if (
				result.type === "pushed-pr-update-failed" ||
				result.type === "pushed-but-authorization-update-failed"
			) {
				return `${result.type}: pushed ${result.headSha}; ${result.error.message}`;
			}
			return `${result.type}: ${result.type === "refused" ? result.code : result.error.message}`;
		},
	});
}
