import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));

const workspacePackageFallbacks: Record<string, string> = {
	"@local-pi-tools/context-profiler/extension": "../../ts/packages/local-pi-tools/context-profiler/src/extension.ts",
	"@local-pi-tools/grill/extension": "../../ts/packages/local-pi-tools/grill/src/extension.ts",
	"@local-pi-tools/runner-subagents/extension": "../../ts/packages/local-pi-tools/runner-subagents/src/extension.ts",
	"@local-pi-tools/thermo-council/extension": "../../ts/packages/local-pi-tools/thermo-council/src/extension.ts",
	"@sdl/pi/worktree-status/extension": "../../ts/packages/hosts/pi/src/worktree-status/extension.ts",
};

type WorkspaceDefaultExport = (pi: unknown, options?: unknown) => void | Promise<void>;

function resolveTypeScriptWorkspacePackage(specifier: string): string {
	try {
		return requireFromTypeScriptWorkspace.resolve(specifier);
	} catch (error) {
		const fallbackPath = workspacePackageFallbacks[specifier];
		if (fallbackPath === undefined) throw error;
		return fileURLToPath(new URL(fallbackPath, import.meta.url));
	}
}

export async function importTypeScriptWorkspaceDefault(specifier: string): Promise<WorkspaceDefaultExport> {
	const importedModule = (await import(resolveTypeScriptWorkspacePackage(specifier))) as { default: WorkspaceDefaultExport };
	return importedModule.default;
}
