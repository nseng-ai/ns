import { expect, test } from "vitest";

import { confirmOrUsageError } from "@nseng-ai/clinkr/app";
import { createFakeClinkrInteraction } from "@nseng-ai/clinkr/testing";

test("non-interactive confirmation returns a usage error without prompting", async () => {
	const fake = createFakeClinkrInteraction();

	await expect(
		confirmOrUsageError(fake.interaction, { message: "Delete everything?" }),
	).resolves.toEqual({
		status: "usage-error",
		errorType: "usage-error",
		message: "Interactive confirmation is required.",
	});
	expect(fake.requests()).toEqual([]);
	expect(() => fake.assertComplete()).not.toThrow();
});

test.each([
	["confirmed", { type: "confirmed" }, { status: "confirmed" }],
	["declined", { type: "declined" }, { status: "negative", message: "Confirmation declined." }],
	[
		"aborted",
		{ type: "aborted" },
		{
			status: "usage-error",
			errorType: "usage-error",
			message: "Confirmation was aborted.",
		},
	],
] as const)("translates an interactive %s answer", async (_label, answer, expected) => {
	const fake = createFakeClinkrInteraction({ confirmations: [answer], isInteractive: true });

	await expect(
		confirmOrUsageError(fake.interaction, { message: "Delete everything?" }),
	).resolves.toEqual(expected);
	expect(fake.requests()).toEqual([{ message: "Delete everything?", defaultAnswer: "no" }]);
	expect(() => fake.assertComplete()).not.toThrow();
});

test("strict fake exposes unexpected prompts in the modern helper workflow", async () => {
	const fake = createFakeClinkrInteraction({ isInteractive: true });

	await expect(
		confirmOrUsageError(fake.interaction, { message: "Delete everything?" }),
	).rejects.toThrow("Unexpected confirmation prompt: Delete everything?");
});

test("strict fake exposes unused answers in the modern helper workflow", async () => {
	const fake = createFakeClinkrInteraction({
		confirmations: [{ type: "confirmed" }],
		isInteractive: false,
	});

	await confirmOrUsageError(fake.interaction, { message: "Delete everything?" });
	expect(() => fake.assertComplete()).toThrow("Unused confirmation result(s): 1");
});
