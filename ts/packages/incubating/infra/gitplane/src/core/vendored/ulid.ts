/*! Derived from ulid 3.0.2 — MIT License (c) 2017 Alizain Feerasta */

import { randomBytes } from "node:crypto";

const CROCKFORD_LOWER = "0123456789abcdefghjkmnpqrstvwxyz";
const MAX_ULID_TIME_MS = 281_474_976_710_655;
const RANDOM_BYTES = 16;
const TIME_CHARACTERS = 10;
const CANONICAL_ULID_PATTERN = /^[0-7][0123456789abcdefghjkmnpqrstvwxyz]{25}$/;

export function isCanonicalUlid(value: string): boolean {
	return CANONICAL_ULID_PATTERN.test(value);
}

function encodeTime(timestampMs: number): string {
	if (!Number.isInteger(timestampMs) || timestampMs < 0 || timestampMs > MAX_ULID_TIME_MS)
		throw new RangeError("ULID timestamp must fit in 48 bits");
	let remaining = timestampMs;
	let encoded = "";
	for (let index = 0; index < TIME_CHARACTERS; index++) {
		const digit = remaining % CROCKFORD_LOWER.length;
		const character = CROCKFORD_LOWER[digit];
		// Deviation from upstream: guard string indexing to honor noUncheckedIndexedAccess.
		if (character === undefined) throw new RangeError("ULID timestamp digit is unsupported");
		encoded = character + encoded;
		remaining = (remaining - digit) / CROCKFORD_LOWER.length;
	}
	return encoded;
}

function encodeRandom(randomness: Uint8Array): string {
	if (randomness.byteLength !== RANDOM_BYTES)
		throw new RangeError(`ULID randomness must contain exactly ${RANDOM_BYTES} bytes`);
	let encoded = "";
	for (const byte of randomness) {
		const character = CROCKFORD_LOWER[byte >>> 3];
		// Deviation from upstream: guard string indexing to honor noUncheckedIndexedAccess.
		if (character === undefined) throw new RangeError("ULID random digit is unsupported");
		encoded += character;
	}
	return encoded;
}

export function generateUlid(timestampMs: number): string {
	return encodeTime(timestampMs) + encodeRandom(randomBytes(RANDOM_BYTES));
}
