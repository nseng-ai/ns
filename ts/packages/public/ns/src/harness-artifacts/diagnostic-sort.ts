export function sortDiagnosticsByKey<TDiagnostic>(
	diagnostics: readonly TDiagnostic[],
	keyFields: (diagnostic: TDiagnostic) => readonly (string | undefined)[],
): readonly TDiagnostic[] {
	return [...diagnostics].sort((left, right) =>
		joinedDiagnosticSortKey(keyFields(left)).localeCompare(
			joinedDiagnosticSortKey(keyFields(right)),
		),
	);
}

function joinedDiagnosticSortKey(fields: readonly (string | undefined)[]): string {
	return fields.map((field) => field ?? "").join("\0");
}
