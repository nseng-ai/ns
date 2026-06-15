import { formatUnknownError } from "./command-registry.ts";
import { loadSdlUserModuleDefault } from "./sdk-module-loader.ts";

export interface ExtensionLoadDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path: string;
}

export type SdlExtensionContributionLoadResult = { ok: true; defaultExport: unknown } | { ok: false; diagnostic: ExtensionLoadDiagnostic };

export async function loadSdlExtensionContribution(modulePath: string): Promise<SdlExtensionContributionLoadResult> {
	try {
		return { ok: true, defaultExport: await loadSdlUserModuleDefault(modulePath) };
	} catch (error) {
		return {
			ok: false,
			diagnostic: diagnostic("sdl_extension_contribution_import_failed", `Failed to load SDL extension contribution ${modulePath}.\n${formatUnknownError(error)}`, modulePath),
		};
	}
}

function diagnostic(code: string, message: string, path: string): ExtensionLoadDiagnostic {
	return { severity: "error", code, message, path };
}

