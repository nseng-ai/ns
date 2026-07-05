import { formatUnknownError } from "./command-registry.ts";
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
	modulePath: string,
): Promise<NsExtensionContributionLoadResult> {
	try {
		return { ok: true, defaultExport: await loadNsUserModuleDefault(modulePath) };
	} catch (error) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"ns_extension_contribution_import_failed",
				`Failed to load ns extension contribution ${modulePath}.\n${formatUnknownError(error)}`,
				modulePath,
			),
		};
	}
}

function diagnostic(code: string, message: string, path: string): ExtensionLoadDiagnostic {
	return { severity: "error", code, message, path };
}
