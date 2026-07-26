import { describe, expect, test } from "vitest";

import { withSafePiUi, withSafePiUiAsync, withSafePiUiValue } from "../src/kit/shared/safe-ui.ts";

describe("withSafePiUi", () => {
	test("returns ok when the UI action succeeds", () => {
		let hasCalled = false;

		const result = withSafePiUi(() => {
			hasCalled = true;
		});

		expect(result).toEqual({ type: "ok" });
		expect(hasCalled).toBe(true);
	});

	test("returns stale-context for Pi stale extension context errors", () => {
		const result = withSafePiUi(() => {
			throw new Error("This extension ctx is stale after session replacement or reload.");
		});

		expect(result).toEqual({
			type: "stale-context",
			message: "This extension ctx is stale after session replacement or reload.",
		});
	});

	test("rethrows non-stale UI errors", () => {
		expect(() => {
			withSafePiUi(() => {
				throw new Error("widget renderer failed");
			});
		}).toThrow("widget renderer failed");
	});
});

describe("withSafePiUiAsync", () => {
	test("returns ok when the async UI action succeeds", async () => {
		let hasCalled = false;

		const result = await withSafePiUiAsync(async () => {
			hasCalled = true;
		});

		expect(result).toEqual({ type: "ok" });
		expect(hasCalled).toBe(true);
	});

	test("returns stale-context for Pi stale extension context errors", async () => {
		const result = await withSafePiUiAsync(async () => {
			throw new Error("This extension ctx is stale after session replacement or reload.");
		});

		expect(result).toEqual({
			type: "stale-context",
			message: "This extension ctx is stale after session replacement or reload.",
		});
	});

	test("rethrows non-stale UI errors", async () => {
		await expect(
			withSafePiUiAsync(async () => {
				throw new Error("widget renderer failed");
			}),
		).rejects.toThrow("widget renderer failed");
	});
});

describe("withSafePiUiValue", () => {
	test("returns action values", () => {
		expect(withSafePiUiValue(() => "widget")).toEqual({ type: "ok", value: "widget" });
	});

	test("returns stale-context instead of throwing recognized stale errors", () => {
		const result = withSafePiUiValue(() => {
			throw new Error("This extension ctx is stale after session replacement or reload.");
		});

		expect(result.type).toBe("stale-context");
	});
});
