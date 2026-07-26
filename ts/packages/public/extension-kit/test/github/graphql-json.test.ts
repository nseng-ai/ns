import { describe, expect, test } from "vitest";

import { graphqlErrorMessages } from "@nseng-ai/extension-kit/github/graphql-json";

describe("graphqlErrorMessages", () => {
	test("returns undefined when the value carries no errors", () => {
		expect(graphqlErrorMessages({ data: { repository: {} } })).toBeUndefined();
		expect(graphqlErrorMessages({ errors: [] })).toBeUndefined();
	});

	test("returns undefined for a non-conforming shape", () => {
		expect(graphqlErrorMessages({ errors: "nope" })).toBeUndefined();
		expect(graphqlErrorMessages("not a json object")).toBeUndefined();
	});

	test("extracts trimmed non-empty per-error messages", () => {
		expect(
			graphqlErrorMessages({
				errors: [{ message: "  Bad credentials  " }, { message: "rate limited" }],
			}),
		).toEqual(["Bad credentials", "rate limited"]);
	});

	test("falls back to a placeholder when errors carry no usable message", () => {
		expect(graphqlErrorMessages({ errors: [{}, { message: "   " }] })).toEqual([
			"GitHub returned GraphQL errors without messages",
		]);
	});
});
