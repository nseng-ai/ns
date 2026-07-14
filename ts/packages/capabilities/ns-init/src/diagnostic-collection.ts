import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

interface DiagnosticIdentity {
	readonly code: string;
	readonly message: string;
	readonly path?: ExplicitUndefined<"public-api-compatibility", string>;
}

export function normalizeExtensionDiagnostic<TDiagnostic extends { readonly code: string }>(
	diagnostic: TDiagnostic,
): Omit<TDiagnostic, "code"> & { readonly code: string } {
	return { ...diagnostic, code: diagnostic.code.replaceAll("_", "-") };
}

export function normalizeExtensionDiagnostics<TDiagnostic extends { readonly code: string }>(
	diagnostics: readonly TDiagnostic[],
): readonly (Omit<TDiagnostic, "code"> & { readonly code: string })[] {
	return diagnostics.map(normalizeExtensionDiagnostic);
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
