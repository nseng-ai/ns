import { describe, expect, test } from "vitest";

import { withSafePiUi, withSafePiUiValue } from "../src/shared/safe-ui.ts";

describe("withSafePiUi", () => {
	test("returns ok when the UI action succeeds", () => {
		let called = false;

		const result = withSafePiUi(() => {
			called = true;
		});

		expect(result).toEqual({ type: "ok" });
		expect(called).toBe(true);
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
