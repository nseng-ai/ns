import { describe, expect, it } from "vitest";

import {
	BINARY_SNIFF_BYTES,
	MAX_ENTRY_BYTES,
	checkEntryNotBinary,
	checkEntrySize,
	formatBytes,
} from "../../src/content-limits.ts";

describe("content limits", () => {
	it("formats byte counts like Python brmem", () => {
		expect(formatBytes(12)).toBe("12 B");
		expect(formatBytes(2048)).toBe("2 KiB");
		expect(formatBytes(MAX_ENTRY_BYTES)).toBe("1.0 MiB");
	});

	it("accepts exactly 1 MiB and rejects one byte above", () => {
		expect(checkEntrySize(new Uint8Array(MAX_ENTRY_BYTES))).toBeUndefined();
		expect(checkEntrySize(new Uint8Array(MAX_ENTRY_BYTES + 1))).toContain("capped at 1 MiB");
	});

	it("sniffs NUL bytes only within the first 8 KiB", () => {
		const inside = new Uint8Array(BINARY_SNIFF_BYTES + 2).fill(65);
		inside[BINARY_SNIFF_BYTES - 1] = 0;
		expect(checkEntryNotBinary(inside)).toBe(
			`appears to be binary (NUL byte at offset ${BINARY_SNIFF_BYTES - 1})`,
		);

		const outside = new Uint8Array(BINARY_SNIFF_BYTES + 2).fill(65);
		outside[BINARY_SNIFF_BYTES] = 0;
		expect(checkEntryNotBinary(outside)).toBeUndefined();
	});

	it("accepts empty content", () => {
		expect(checkEntrySize(new Uint8Array())).toBeUndefined();
		expect(checkEntryNotBinary(new Uint8Array())).toBeUndefined();
	});
});
