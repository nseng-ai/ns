import { resolve } from "node:path";

import {
	failure,
	negative,
	ok,
	usageError,
	type ClinkrExit,
	type ClinkrUsageErrorExit,
} from "@nseng-ai/clinkr";
import { z } from "zod";

import { bindObjectiveRunnerPublication } from "../publication/authorization.ts";
import {
	objectiveRunnerPublicationAuthorizationV1Schema,
	objectiveRunnerPublicationLaunchAttestationV1Schema,
} from "../publication/contracts.ts";
import { publishObjectiveRunnerCheckpoint } from "../publication/publish.ts";
import type { ObjectiveRunnerPublicationCommandContext } from "./publication-context.ts";

const atFileSchema = z
	.string()
	.regex(/^@.+/u, "Expected a bare @file input.")
	.describe("Bare @file path containing the typed JSON input.");
const absoluteAtFileSchema = z
	.string()
	.regex(/^@\//u, "Expected a bare @file input with an absolute path.")
	.describe("Absolute bare @file path for the parent-held authorization artifact.");

export const publicationBindRequestSchema = z.object({
	attestation: atFileSchema,
	authorization: absoluteAtFileSchema,
});

export const publicationBindResultSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("bound"),
		authorizationPath: z.string(),
		target: objectiveRunnerPublicationAuthorizationV1Schema.shape.target,
	}),
	z.object({
		type: z.literal("refused"),
		code: z.string(),
		authorizationPath: z.string().optional(),
	}),
]);

export type PublicationBindRequest = z.infer<typeof publicationBindRequestSchema>;
export type PublicationBindResult = z.infer<typeof publicationBindResultSchema>;

export async function runPublicationBind(
	ctx: ObjectiveRunnerPublicationCommandContext,
	request: PublicationBindRequest,
): Promise<
	ClinkrExit<
		PublicationBindResult,
		PublicationBindResult,
		PublicationBindResult,
		{ readonly argument: string }
	>
> {
	const attestation = await readJsonInput(ctx, request.attestation, "attestation");
	if (!attestation.ok) return attestation.exit;
	const parsed = objectiveRunnerPublicationLaunchAttestationV1Schema.safeParse(attestation.value);
	if (!parsed.success) {
		return usageError("Publication attestation file does not match the version 1 schema.", {
			argument: "attestation",
		});
	}
	const authorizationPath = absoluteAtPath(ctx.cwd, request.authorization);
	const bound = await bindObjectiveRunnerPublication(ctx.facts, {
		repoRoot: ctx.repoRoot,
		attestation: parsed.data,
	});
	if (!bound.ok) {
		return negative(bound.refusal.message, {
			type: "refused",
			code: bound.refusal.code,
		});
	}
	const stored = await ctx.authorizations.bind(
		authorizationPath,
		`${JSON.stringify(bound.value, null, 2)}\n`,
	);
	if (!stored.ok) {
		return failure(stored.error.code, stored.error.message, {
			type: "refused",
			code: stored.error.code,
			authorizationPath,
		});
	}
	return ok({
		type: "bound",
		authorizationPath,
		target: bound.value.target,
	});
}

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

async function readJsonInput(
	ctx: ObjectiveRunnerPublicationCommandContext,
	input: string,
	argument: string,
): Promise<
	| { ok: true; value: unknown }
	| { ok: false; exit: ClinkrUsageErrorExit<{ readonly argument: string }> }
> {
	const path = absoluteAtPath(ctx.cwd, input);
	const read = await ctx.readTextFile(path);
	if (!read.ok) {
		return {
			ok: false,
			exit: usageError(`Could not read @file input ${path}: ${read.message}`, { argument }),
		};
	}
	const parsed = parseJson(read.content);
	if (!parsed.ok) {
		return {
			ok: false,
			exit: usageError(`@file input ${path} is not valid JSON.`, { argument }),
		};
	}
	return parsed;
}

function absoluteAtPath(cwd: string, input: string): string {
	return resolve(cwd, input.slice(1));
}

function parseJson(content: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(content) as unknown };
	} catch {
		return { ok: false };
	}
}
