import { expect, test } from "vitest";

import { ClinkrGroup } from "@asdl/clinkr";
import {
	createCaptureIo,
	createFakeClinkrInteraction,
	createOneShotStdinAdapter,
	createScenarioClinkrInteraction,
	type CapturedRun,
} from "@asdl/clinkr/testing";

test("subpath exports resolve through the package name", async () => {
	const capture = createCaptureIo();
	capture.io.stdout("x");
	expect(capture.stdout()).toBe("x");
	const run: CapturedRun | null = null;
	expect(run).toBeNull();
	expect(typeof ClinkrGroup).toBe("function");

	const fake = createFakeClinkrInteraction({ confirmations: [{ type: "confirmed" }] });
	await expect(
		fake.interaction.confirm({ message: "Continue?", defaultAnswer: "no" }),
	).resolves.toEqual({ type: "confirmed" });
	expect(fake.requests()).toEqual([{ message: "Continue?", defaultAnswer: "no" }]);
	expect(() => fake.assertComplete()).not.toThrow();
});

test("fake interaction fails on unexpected and unused confirmations", async () => {
	const empty = createFakeClinkrInteraction();
	await expect(
		empty.interaction.confirm({ message: "Unexpected?", defaultAnswer: "yes" }),
	).rejects.toThrow("Unexpected confirmation prompt: Unexpected?");

	const unused = createFakeClinkrInteraction({ confirmations: [{ type: "aborted" }] });
	expect(() => unused.assertComplete()).toThrow("Unused confirmation result(s): 1");
});

test("one-shot stdin adapter consumes string input once", async () => {
	const stdin = createOneShotStdinAdapter("yes");

	await expect(stdin()).resolves.toBe("yes");
	await expect(stdin()).resolves.toBeNull();
});

test("one-shot stdin adapter treats missing input as aborted", async () => {
	const stdin = createOneShotStdinAdapter(undefined);

	await expect(stdin()).resolves.toBeNull();
	await expect(stdin()).resolves.toBeNull();
});

test("one-shot stdin adapter delegates function input", async () => {
	const responses = ["first", "second"];
	const stdin = createOneShotStdinAdapter(async () => responses.shift() ?? null);

	await expect(stdin()).resolves.toBe("first");
	await expect(stdin()).resolves.toBe("second");
	await expect(stdin()).resolves.toBeNull();
});

test("scenario interaction helper creates a deps fake when stdin is not supplied", async () => {
	const scenario = createScenarioClinkrInteraction({
		hasStdin: false,
		confirmations: [{ type: "confirmed" }],
	});
	expect(scenario.depsInteraction).toBe(scenario.contextInteraction);
	await expect(
		scenario.contextInteraction.confirm({ message: "Continue?", defaultAnswer: "no" }),
	).resolves.toEqual({ type: "confirmed" });
	expect(() => scenario.assertComplete()).not.toThrow();
});

test("scenario interaction helper uses stdin-driven CLI interaction when stdin is supplied", () => {
	const scenario = createScenarioClinkrInteraction({ hasStdin: true });
	expect(scenario.depsInteraction).toBeUndefined();
	expect(() => scenario.assertComplete()).not.toThrow();
});

test("scenario interaction helper preserves explicit interactions", () => {
	const fake = createFakeClinkrInteraction();
	const scenario = createScenarioClinkrInteraction({
		hasStdin: true,
		interaction: fake.interaction,
	});
	expect(scenario.depsInteraction).toBe(fake.interaction);
	expect(scenario.contextInteraction).toBe(fake.interaction);
});
