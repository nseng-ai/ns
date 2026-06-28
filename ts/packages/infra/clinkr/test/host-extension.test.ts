import { describe, expect, test } from "vitest";

import { readCapsFromHostExtension } from "../src/index.ts";

describe("clinkr host extensions", () => {
	test("reads a valid caps payload and strips extra fields", () => {
		expect(
			readCapsFromHostExtension({
				isTty: true,
				colorDepth: "ansi256",
				columns: 120,
				canRenderUnicode: false,
				extra: "ignored",
			}),
		).toEqual({
			isTty: true,
			colorDepth: "ansi256",
			columns: 120,
			canRenderUnicode: false,
		});
	});

	test("returns undefined for non-object payloads", () => {
		expect(readCapsFromHostExtension(undefined)).toBeUndefined();
		expect(readCapsFromHostExtension(null)).toBeUndefined();
		expect(readCapsFromHostExtension("not-caps")).toBeUndefined();
		expect(readCapsFromHostExtension(1)).toBeUndefined();
		expect(readCapsFromHostExtension(true)).toBeUndefined();
	});

	test("returns undefined for invalid caps fields", () => {
		const valid = {
			isTty: true,
			colorDepth: "truecolor",
			columns: 80,
			canRenderUnicode: true,
		};

		expect(readCapsFromHostExtension({ ...valid, isTty: "true" })).toBeUndefined();
		expect(readCapsFromHostExtension({ ...valid, colorDepth: "mono" })).toBeUndefined();
		expect(readCapsFromHostExtension({ ...valid, columns: 0 })).toBeUndefined();
		expect(readCapsFromHostExtension({ ...valid, columns: 80.5 })).toBeUndefined();
		expect(
			readCapsFromHostExtension({ ...valid, columns: Number.POSITIVE_INFINITY }),
		).toBeUndefined();
		expect(readCapsFromHostExtension({ ...valid, canRenderUnicode: "true" })).toBeUndefined();
	});
});
