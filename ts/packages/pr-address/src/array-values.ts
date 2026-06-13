export function requiredAt<T>(values: readonly T[], index: number, description = "value"): T {
	const value = values[index];
	if (value === undefined) throw new Error(`Missing aligned ${description} at index ${index}.`);
	return value;
}
