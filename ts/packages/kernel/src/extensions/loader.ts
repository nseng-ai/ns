import { formatUnknownError } from "./command-registry.ts";
import { moduleReferenceDisplay, type NsCommandModuleReference } from "./module-reference.ts";
import { importDefaultExport } from "../runtime/module-import.ts";
import { loadNsUserModuleDefault } from "../runtime/module-loader.ts";

export interface ExtensionLoadDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path: string;
}

export type NsExtensionContributionLoadResult =
	| { ok: true; defaultExport: unknown }
	| { ok: false; diagnostic: ExtensionLoadDiagnostic };

export async function loadNsExtensionContribution(
	reference: NsCommandModuleReference,
): Promise<NsExtensionContributionLoadResult> {
	const displayPath = moduleReferenceDisplay(reference);
	try {
		return { ok: true, defaultExport: await loadDefaultExport(reference) };
	} catch (error) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"ns_extension_contribution_import_failed",
				`Failed to load ns extension contribution ${displayPath}.\n${formatUnknownError(error)}`,
				displayPath,
			),
		};
	}
}

async function loadDefaultExport(reference: NsCommandModuleReference): Promise<unknown> {
	if (reference.type === "file") return await loadNsUserModuleDefault(reference.path);
	if (reference.type === "package") return await importDefaultExport(reference.specifier);
	return await reference.load();
}

function diagnostic(code: string, message: string, path: string): ExtensionLoadDiagnostic {
	return { severity: "error", code, message, path };
}
