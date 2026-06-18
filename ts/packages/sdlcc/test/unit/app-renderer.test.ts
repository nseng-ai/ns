import { describe, expect, test } from "vitest";

import { createSdlccAppControllers } from "../../src/app-renderer.ts";

describe("app renderer composition", () => {
	test("builds the consolidated dashboard-first shell controllers", () => {
		const controllers = createSdlccAppControllers();

		expect(controllers.map((controller) => controller.id)).toEqual(["dashboard", "stack-map"]);
		expect(controllers[0]?.refreshMs).toBe(3_000);
		expect(controllers[1]?.refreshMs).toBeUndefined();
	});
});
