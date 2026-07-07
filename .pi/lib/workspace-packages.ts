import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireFromTypeScriptWorkspace = createRequire(new URL("../../ts/package.json", import.meta.url));

const workspacePackageFallbacks: Record<string, string> = {
	"@internal/pi-tools/context-profiler/extension": "../../ts/packages/internal/pi-tools/src/context-profiler/extension.ts",
	"@internal/pi-tools/grill/extension": "../../ts/packages/internal/pi-tools/src/grill/extension.ts",
	"@internal/pi-tools/slash-command-rerank/extension": "../../ts/packages/internal/pi-tools/src/slash-command-rerank/extension.ts",
	"@internal/pi-tools/thermo-council/extension": "../../ts/packages/internal/pi-tools/src/thermo-council/extension.ts",
	"@nseng-ai/ns-pi-subagents/extension": "../../ts/packages/extensions/ns-pi-subagents/src/extension.ts",
	"@nseng-ai/pi/worktree-status/extension": "../../ts/packages/hosts/pi/src/worktree-status/extension.ts",
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
