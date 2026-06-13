export function trimOptional(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

export function trimRequired(value: string | null | undefined): string {
	const trimmed = trimOptional(value);
	if (trimmed === null) throw new Error("Expected non-empty string.");
	return trimmed;
}

/** Render a string the way Python `repr()` renders ordinary strings, for byte-parity with Python error messages. */
export function pythonRepr(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

/** Render a string the way Python `repr()` renders a string or `None`, for byte-parity with classification validation. */
export function pythonReprOrNull(value: string | null): string {
	if (value === null) return "None";
	return pythonRepr(value);
}

/** Return values that appear more than once, in the order of their first duplicate occurrence. */
export function duplicateValues<T>(values: readonly T[]): T[] {
	const counts = new Map<T, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	const seen = new Set<T>();
	const duplicates: T[] = [];
	for (const value of values) {
		if ((counts.get(value) ?? 0) > 1 && !seen.has(value)) {
			duplicates.push(value);
			seen.add(value);
		}
	}
	return duplicates;
}

/** Validate provenance shape, returning an error message if invalid. */
export function provenanceShapeError(provenance: { kind: string; branch?: string; pr_number?: number }): string | null {
	if (provenance.kind === "local_branch") return trimOptional(provenance.branch) === null ? "kind='local_branch' provenance requires a non-empty branch" : null;
	if (provenance.kind === "pr" && (provenance.pr_number === undefined || provenance.pr_number <= 0)) {
		return "kind='pr' provenance requires a positive pr_number";
	}
	return null;
}
