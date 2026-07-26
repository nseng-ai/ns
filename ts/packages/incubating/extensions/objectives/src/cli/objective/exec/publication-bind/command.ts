import { failure, negative, ok, usageError, type ClinkrExit } from "@nseng-ai/clinkr";
import type { NsExtensionApi } from "@nseng-ai/sdk";
import { z } from "zod";

import {
	absoluteAtFileSchema,
	absoluteAtPath,
	atFileSchema,
	readJsonInput,
} from "../../../../ns/at-file-inputs.ts";
import { objectiveNsCommandWithContext } from "../../../../ns/objective-command.ts";
import {
	createNsObjectiveRunnerPublicationContext,
	type ObjectiveRunnerPublicationCommandContext,
} from "../../../../ns/publication-context.ts";
import { bindObjectiveRunnerPublication } from "../../../../publication/authorization.ts";
import {
	objectiveRunnerPublicationAuthorizationV1Schema,
	objectiveRunnerPublicationLaunchAttestationV1Schema,
} from "../../../../publication/contracts.ts";

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

export async function command(
	createContext?: (
		api: NsExtensionApi,
	) => Promise<ObjectiveRunnerPublicationCommandContext> | ObjectiveRunnerPublicationCommandContext,
) {
	return objectiveNsCommandWithContext({
		schema: publicationBindRequestSchema,
		resultSchema: publicationBindResultSchema,
		negativeSchema: publicationBindResultSchema,
		failureSchema: publicationBindResultSchema,
		usageErrorSchema: z.any(),
		createContext: createContext ?? createNsObjectiveRunnerPublicationContext,
		handler: runPublicationBind,
		renderHuman: (result) =>
			result.type === "bound"
				? `Bound Objective Runner publication authorization at ${result.authorizationPath}.`
				: `Publication binding refused: ${result.code}.`,
	});
}
