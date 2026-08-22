import type * as z from "zod";

/** A lazy, memoized owner of one deterministic Zod schema. */
export interface ZodDeclaration<TSchema extends z.ZodType> {
	readonly schema: TSchema;
	parse(input: unknown): z.output<TSchema>;
	safeParse(input: unknown): z.ZodSafeParseResult<z.output<TSchema>>;
}

class MemoizedZodDeclaration<TSchema extends z.ZodType> implements ZodDeclaration<TSchema> {
	readonly #initialize: () => TSchema;
	#schema: TSchema | undefined;

	constructor(initialize: () => TSchema) {
		this.#initialize = initialize;
	}

	get schema(): TSchema {
		this.#schema ??= this.#initialize();
		return this.#schema;
	}

	parse(input: unknown): z.output<TSchema> {
		return this.schema.parse(input);
	}

	safeParse(input: unknown): z.ZodSafeParseResult<z.output<TSchema>> {
		return this.schema.safeParse(input);
	}
}

/** Declares a schema without constructing it until its first use. */
export function zDecl<TSchema extends z.ZodType>(
	initialize: () => TSchema,
): ZodDeclaration<TSchema> {
	return new MemoizedZodDeclaration(initialize);
}
