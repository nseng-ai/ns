import { describe, expect, test } from "vitest";

import { createHerdrSlotsCapabilityProbe } from "../src/pi/slots-capability.ts";
import { fakeNsExtensionApi } from "./herdr-test-harness.ts";

function contextWithSlots(cwd: string, hasSlots: boolean) {
	return {
		pi: {},
		git: {},
		herdr: {},
		ns: fakeNsExtensionApi(cwd, hasSlots),
	};
}

describe("createHerdrSlotsCapabilityProbe", () => {
	test("reports Slots available from exact ns extension presence", async () => {
		const probe = createHerdrSlotsCapabilityProbe(async () =>
			contextWithSlots("/slot/worktree", true),
		);

		expect(await probe("/slot/worktree")).toBe(true);
	});

	test("reports Slots unavailable when the ns API is absent", async () => {
		const probe = createHerdrSlotsCapabilityProbe(async () => ({
			...contextWithSlots("/repo", false),
			ns: undefined,
		}));

		expect(await probe("/repo")).toBe(false);
	});

	test("reports Slots unavailable when the exact package is absent", async () => {
		const probe = createHerdrSlotsCapabilityProbe(async () => contextWithSlots("/repo", false));

		expect(await probe("/repo")).toBe(false);
	});
});
