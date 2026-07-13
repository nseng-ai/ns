import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

interface DiagnosticIdentity {
	readonly code: string;
	readonly message: string;
	readonly path?: ExplicitUndefined<"public-api-compatibility", string>;
}

export function appendDiagnosticToCollection<TDiagnostic extends DiagnosticIdentity>(
	diagnostics: readonly TDiagnostic[],
	diagnostic: TDiagnostic,
): readonly TDiagnostic[] {
	const isDuplicate = diagnostics.some(
		(existing) =>
			existing.code === diagnostic.code &&
			existing.message === diagnostic.message &&
			existing.path === diagnostic.path,
	);
	return isDuplicate ? diagnostics : [...diagnostics, { ...diagnostic }];
}
