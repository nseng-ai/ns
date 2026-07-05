import { z } from "zod";

import { isRecord } from "@nseng-ai/foundation/primitives";

export type JsonParseResult =
	| { readonly type: "ok"; readonly value: unknown }
	| { readonly type: "error"; readonly error: unknown };

type GraphqlErrorsParseResult =
	| { readonly type: "ok"; readonly errors: readonly unknown[] | undefined }
	| { readonly type: "invalid" };

export const githubGraphqlErrorsSchema = z
	.object({ errors: z.array(z.unknown()).optional() })
	.loose();

export function parseJsonUnknown(text: string): JsonParseResult {
	try {
		return { type: "ok", value: JSON.parse(text) as unknown };
	} catch (error) {
		return { type: "error", error };
	}
}

export function parseGraphqlErrors(value: unknown): GraphqlErrorsParseResult {
	const result = githubGraphqlErrorsSchema.safeParse(value);
	if (!result.success) return { type: "invalid" };
	return { type: "ok", errors: result.data.errors };
}

/**
 * Extract GraphQL error messages from a whole parsed JSON response. Returns
 * `undefined` when the value carries no `errors` (or a non-conforming shape),
 * the trimmed non-empty per-error `message` strings when present, and a single
 * placeholder message when errors exist but none carry a usable message.
 */
export function graphqlErrorMessages(json: unknown): readonly string[] | undefined {
	const parsed = parseGraphqlErrors(json);
	if (parsed.type === "invalid") return undefined;
	const errors = parsed.errors;
	if (errors === undefined || errors.length === 0) return undefined;
	const messages = errors.flatMap((error) => {
		if (!isRecord(error)) return [];
		const message = error.message;
		if (typeof message !== "string") return [];
		const trimmed = message.trim();
		return trimmed.length > 0 ? [trimmed] : [];
	});
	return messages.length > 0 ? messages : ["GitHub returned GraphQL errors without messages"];
}
