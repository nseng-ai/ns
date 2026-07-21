import { describe, expect, test } from "vitest";

import { hasSlotsExtension } from "../src/pi/slots-capability.ts";
import { fakeNsExtensionApi } from "./herdr-test-harness.ts";

describe("hasSlotsExtension", () => {
	test("reports exact Slots extension presence", async () => {
		expect(
			await hasSlotsExtension(async (cwd) => fakeNsExtensionApi(cwd, true), "/slot/worktree"),
		).toBe(true);
		expect(await hasSlotsExtension(async (cwd) => fakeNsExtensionApi(cwd), "/slot/worktree")).toBe(
			false,
		);
	});

	test("propagates the original API construction error", async () => {
		const error = new Error("ns unavailable");

		await expect(hasSlotsExtension(async () => Promise.reject(error), "/repo")).rejects.toBe(error);
	});

	test("propagates the original extension lookup error", async () => {
		const error = new Error("invalid extension catalog");

		await expect(
			hasSlotsExtension(async (cwd) => {
				const api = fakeNsExtensionApi(cwd);
				return {
					...api,
					hasExtension: () => {
						throw error;
					},
				};
			}, "/repo"),
		).rejects.toBe(error);
	});
});
