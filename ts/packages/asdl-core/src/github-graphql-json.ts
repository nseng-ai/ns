import { z } from "zod";

export type JsonParseResult =
	| { readonly type: "ok"; readonly value: unknown }
	| { readonly type: "error"; readonly error: unknown };

export type GraphqlErrorsParseResult =
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

export function graphqlErrorsFromJson(value: unknown): readonly unknown[] | undefined {
	const result = parseGraphqlErrors(value);
	if (result.type === "invalid") return undefined;
	return result.errors;
}
