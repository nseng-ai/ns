import { loadSdlUserModuleDefault } from "./sdk-module-loader.ts";
import type { ExtensionFactory } from "./extension-api.ts";

export interface ExtensionLoadDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path: string;
}

export type ExtensionFactoryLoadResult = { ok: true; factory: ExtensionFactory } | { ok: false; diagnostic: ExtensionLoadDiagnostic };

export async function loadExtensionFactory(modulePath: string): Promise<ExtensionFactoryLoadResult> {
	let defaultExport: unknown;
	try {
		defaultExport = await loadSdlUserModuleDefault(modulePath);
	} catch (error) {
		return {
			ok: false,
			diagnostic: diagnostic("extension_import_failed", `Failed to load extension ${modulePath}.\n${formatUnknownError(error)}`, modulePath),
		};
	}

	if (typeof defaultExport !== "function") {
		return {
			ok: false,
			diagnostic: diagnostic("extension_default_not_function", `Extension default export must be a factory function: ${modulePath}.`, modulePath),
		};
	}
	return { ok: true, factory: defaultExport as ExtensionFactory };
}

function diagnostic(code: string, message: string, path: string): ExtensionLoadDiagnostic {
	return { severity: "error", code, message, path };
}

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
