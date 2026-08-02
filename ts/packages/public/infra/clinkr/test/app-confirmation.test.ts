import { expect, test } from "vitest";

import { confirmOrUsageError, failure, ok } from "@nseng-ai/clinkr/app";
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

test("advanced policy returns an actionable usage error without prompting", async () => {
	const fake = createFakeClinkrInteraction();
	const onDeclined = () => ok({ cancelled: true });
	const onAborted = () => failure("aborted", "Aborted!");

	await expect(
		confirmOrUsageError(fake.interaction, {
			message: "Delete everything?",
			nonInteractive: {
				message: "Deletion requires --yes when non-interactive.",
				missingFlag: "--yes",
				howToSupply: "Pass --yes to confirm deletion without prompting.",
			},
			onDeclined,
			onAborted,
		}),
	).resolves.toEqual({
		status: "usage-error",
		errorType: "usage-error",
		message: "Deletion requires --yes when non-interactive.",
		data: {
			missingFlag: "--yes",
			howToSupply: "Pass --yes to confirm deletion without prompting.",
		},
	});
	expect(fake.requests()).toEqual([]);
	expect(() => fake.assertComplete()).not.toThrow();
});

test.each([
	["confirmed", { type: "confirmed" }, { status: "confirmed" }],
	["declined", { type: "declined" }, { status: "success", data: { cancelled: true } }],
	[
		"aborted",
		{ type: "aborted" },
		{ status: "failure", errorType: "aborted", message: "Aborted!" },
	],
] as const)("advanced policy maps an interactive %s answer", async (_label, answer, expected) => {
	const fake = createFakeClinkrInteraction({ confirmations: [answer], isInteractive: true });
	const mappingCalls: string[] = [];

	await expect(
		confirmOrUsageError(fake.interaction, {
			message: "Delete everything?",
			nonInteractive: {
				message: "Deletion requires --yes when non-interactive.",
				missingFlag: "--yes",
				howToSupply: "Pass --yes to confirm deletion without prompting.",
			},
			onDeclined: () => {
				mappingCalls.push("declined");
				return ok({ cancelled: true });
			},
			onAborted: () => {
				mappingCalls.push("aborted");
				return failure("aborted", "Aborted!");
			},
		}),
	).resolves.toEqual(expected);
	expect(mappingCalls).toEqual(answer.type === "confirmed" ? [] : [answer.type]);
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
