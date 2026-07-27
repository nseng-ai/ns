import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const requireFromTypeScriptWorkspace = createRequire(
	new URL("../../ts/package.json", import.meta.url),
);
const requireFromTypeScriptSdk = createRequire(
	new URL("../../ts/packages/public/sdk/package.json", import.meta.url),
);

const workspacePackageFallbacks: Record<string, string> = {
	"@internal/ns-pi-subagents/api": "../../ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/api/index.ts",
	"@internal/ns-pi-subagents/extension":
		"../../ts/packages/internal/hosts/pi/subagents/ns-pi-subagents/src/extension.ts",
	"@internal/pi-tools/context-profiler/extension":
		"../../ts/packages/internal/hosts/pi/tools/pi-tools/src/context-profiler/extension.ts",
	"@internal/pi-tools/grill/extension":
		"../../ts/packages/internal/hosts/pi/tools/pi-tools/src/grill/extension.ts",
	"@internal/pi-tools/slash-command-rerank/extension":
		"../../ts/packages/internal/hosts/pi/tools/pi-tools/src/slash-command-rerank/extension.ts",
	"@internal/pi-tools/thermo-council/extension":
		"../../ts/packages/internal/hosts/pi/tools/pi-tools/src/thermo-council/extension.ts",
	"@nseng-ai/pi-ns-objectives/extension":
		"../../ts/packages/incubating/hosts/pi/extensions/pi-ns-objectives/src/extension.ts",
	"@nseng-ai/pi-runtime/commands/ack":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/ack.ts",
	"@nseng-ai/pi-runtime/commands/cli-command-live-progress":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-live-progress.ts",
	"@nseng-ai/pi-runtime/core/model-shortcuts/extension":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/core/model-shortcuts/extension.ts",
	"@nseng-ai/pi-runtime/core/pr/extension":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/core/pr/extension.ts",
	"@nseng-ai/pi-runtime/runtime/machine-envelope":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/runtime/machine-envelope.ts",
	"@nseng-ai/pi-runtime/runtime/primitives":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/runtime/primitives.ts",
	"@nseng-ai/pi-runtime/search/ripgrep-defaults":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/search/ripgrep-defaults.ts",
	"@nseng-ai/pi-runtime/sessions/harness-session":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/core/sessions/harness-session.ts",
	"@nseng-ai/pi-runtime/shared/command-exec": "../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/shared/command-exec.ts",
	"@nseng-ai/pi-runtime/skills/expansion":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/skills/expansion.ts",
	"@nseng-ai/pi-runtime/worktree-status/extension":
		"../../ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/worktree-status/extension.ts",
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

export async function importTypeScriptWorkspaceModule<T>(specifier: string): Promise<T> {
	return (await import(resolveTypeScriptWorkspacePackage(specifier))) as T;
}

/** Reload a source workspace module and its transitive TypeScript dependencies. */
export async function importFreshTypeScriptWorkspaceModule<T>(specifier: string): Promise<T> {
	const jitiModule = requireFromTypeScriptSdk("jiti") as {
		createJiti(id: string, options: { moduleCache: boolean; fsCache: boolean }): {
			import<TModule>(id: string): Promise<TModule>;
		};
	};
	const jiti = jitiModule.createJiti(import.meta.url, {
		moduleCache: false,
		fsCache: false,
	});
	return await jiti.import<T>(resolveTypeScriptWorkspacePackage(specifier));
}

export async function importTypeScriptWorkspaceDefault(
	specifier: string,
): Promise<WorkspaceDefaultExport> {
	const importedModule = await importTypeScriptWorkspaceModule<{ default: WorkspaceDefaultExport }>(
		specifier,
	);
	return importedModule.default;
}
