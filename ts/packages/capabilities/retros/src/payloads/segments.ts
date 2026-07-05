/**
 * Safe path segment validation for payload artifact identifiers.
 */

const SAFE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function isSafeSegment(value: string): boolean {
	return SAFE_SEGMENT_PATTERN.test(value);
}

export function requireSafeSegment(value: string, label: string): string {
	if (isSafeSegment(value)) {
		return value;
	}
	throw new Error(
		`${label} must match safe segment pattern ^[a-z0-9][a-z0-9._-]{0,127}$: ${JSON.stringify(value)}`,
	);
}
