import { describe, expect, test } from "vitest";
import { encodeCrockfordBase32Lower } from "../../src/core/vendored/crockford-base32.ts";
import { generateUlid, isCanonicalUlid } from "../../src/core/vendored/ulid.ts";

describe("vendored Crockford Base32 encoding", () => {
	test.each([
		[new Uint8Array(), ""],
		[Uint8Array.from([0x12, 0xab]), "2ang"],
		[Uint8Array.from([0xff]), "zw"],
		[Uint8Array.from([0x00, 0x01, 0x02, 0x03]), "000g40r"],
	] as const)("encodes %j", (bytes, expected) => {
		expect(encodeCrockfordBase32Lower(bytes)).toBe(expected);
	});
});

describe("vendored ULID generation and validation", () => {
	test("generates a canonical ULID with the requested timestamp", () => {
		const generated = generateUlid(1_469_918_176_385);
		expect(generated).toMatch(/^01aryz6s41[0123456789abcdefghjkmnpqrstvwxyz]{16}$/);
		expect(isCanonicalUlid(generated)).toBe(true);
	});

	test.each(["00000000000000000000000000", "7zzzzzzzzzzzzzzzzzzzzzzzzz"])(
		"accepts canonical boundary %s",
		(value) => {
			expect(isCanonicalUlid(value)).toBe(true);
		},
	);

	test.each([
		"80000000000000000000000000",
		"0000000000000000000000000",
		"0000000000000000000000000i",
		"0000000000000000000000000O",
	])("rejects non-canonical value %s", (value) => {
		expect(isCanonicalUlid(value)).toBe(false);
	});

	test.each([-1, 1.5, 281_474_976_710_656])("rejects invalid timestamp %s", (timestampMs) => {
		expect(() => generateUlid(timestampMs)).toThrow("ULID timestamp must fit in 48 bits");
	});
});
