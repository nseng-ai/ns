import { expect, test } from "vitest";

import { ClinkrGroup } from "@asdl/clinkr";
import {
	createCaptureIo,
	createFakeClinkrInteraction,
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
