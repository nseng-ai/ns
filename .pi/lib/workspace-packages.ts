import { createRequire } from "node:module";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));

type WorkspaceDefaultExport = (pi: unknown, options?: unknown) => void | Promise<void>;

export function resolveTypeScriptWorkspacePackage(specifier: string): string {
	return requireFromTypeScriptWorkspace.resolve(specifier);
}

export async function importTypeScriptWorkspaceDefault<T = WorkspaceDefaultExport>(specifier: string): Promise<T> {
	const importedModule = (await import(resolveTypeScriptWorkspacePackage(specifier))) as { default: T };
	return importedModule.default;
}
