import { loadSdlUserModuleDefault } from "./sdk-module-loader.ts";

export interface ExtensionLoadDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path: string;
}

export type SdlCommandEntryLoadResult = { ok: true; defaultExport: unknown } | { ok: false; diagnostic: ExtensionLoadDiagnostic };

export async function loadSdlCommandEntry(modulePath: string): Promise<SdlCommandEntryLoadResult> {
	try {
		return { ok: true, defaultExport: await loadSdlUserModuleDefault(modulePath) };
	} catch (error) {
		return {
			ok: false,
			diagnostic: diagnostic("extension_command_import_failed", `Failed to load SDL command entry ${modulePath}.\n${formatUnknownError(error)}`, modulePath),
		};
	}
}

function diagnostic(code: string, message: string, path: string): ExtensionLoadDiagnostic {
	return { severity: "error", code, message, path };
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
