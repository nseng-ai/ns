/*! Derived from @scure/base 2.2.0 — MIT License (c) 2022 Paul Miller (paulmillr.com) */

const CROCKFORD_LOWER = "0123456789abcdefghjkmnpqrstvwxyz";
const POWERS_OF_TWO = Array.from({ length: 33 }, (_, index) => 2 ** index);

function greatestCommonDivisor(left: number, right: number): number {
	return right === 0 ? left : greatestCommonDivisor(right, left % right);
}

function maximumCarryBits(fromBits: number, toBits: number): number {
	return fromBits + (toBits - greatestCommonDivisor(fromBits, toBits));
}

function convertRadix2(
	data: readonly number[],
	fromBits: number,
	toBits: number,
	padding: boolean,
): number[] {
	if (fromBits <= 0 || fromBits > 32)
		throw new RangeError(`Crockford Base32 input word width is invalid: ${fromBits}`);
	if (toBits <= 0 || toBits > 32)
		throw new RangeError(`Crockford Base32 output word width is invalid: ${toBits}`);
	if (maximumCarryBits(fromBits, toBits) > 32)
		throw new RangeError("Crockford Base32 conversion would overflow its carry");

	let carry = 0;
	let position = 0;
	const inputLimit = POWERS_OF_TWO[fromBits];
	const outputLimit = POWERS_OF_TWO[toBits];
	// Deviation from upstream: guard table lookups to honor noUncheckedIndexedAccess.
	if (inputLimit === undefined) throw new RangeError("Crockford Base32 input width is unsupported");
	if (outputLimit === undefined)
		throw new RangeError("Crockford Base32 output width is unsupported");
	const outputMask = outputLimit - 1;
	const result: number[] = [];

	for (const word of data) {
		if (!Number.isSafeInteger(word) || word < 0 || word >= inputLimit)
			throw new RangeError(`Crockford Base32 input word is invalid: ${word}`);
		carry = (carry << fromBits) | word;
		if (position + fromBits > 32)
			throw new RangeError("Crockford Base32 conversion overflowed its carry");
		position += fromBits;
		for (; position >= toBits; position -= toBits)
			result.push(((carry >> (position - toBits)) & outputMask) >>> 0);
		const positionPower = POWERS_OF_TWO[position];
		if (positionPower === undefined)
			throw new RangeError("Crockford Base32 carry width is unsupported");
		carry &= positionPower - 1;
	}

	carry = (carry << (toBits - position)) & outputMask;
	if (!padding && position >= fromBits) throw new RangeError("Crockford Base32 has excess padding");
	if (!padding && carry > 0) throw new RangeError("Crockford Base32 has non-zero padding");
	if (padding && position > 0) result.push(carry >>> 0);
	return result;
}

export function encodeCrockfordBase32Lower(bytes: Uint8Array): string {
	return convertRadix2(Array.from(bytes), 8, 5, true)
		.map((digit) => CROCKFORD_LOWER[digit])
		.join("");
}
