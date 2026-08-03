import { failure } from "@nseng-ai/clinkr/legacy";
import type { ClinkrExit } from "@nseng-ai/clinkr/legacy";
import { classifyExtensionSourceLifecycle } from "@nseng-ai/sdk/project-config";

import type {
	DeclaredExtensionsGateway,
	UserExtensionAvailabilityGateway,
} from "./declared-extensions.ts";
import type {
	ExpectedUserExtensionConfigState,
	UserExtensionConfigGateway,
} from "./user-extension-config.ts";

export const extensionLifecycleScopeSchemaValues = ["project", "user"] as const;
export type ExtensionLifecycleScope = (typeof extensionLifecycleScopeSchemaValues)[number];

export interface UserExtensionLifecycleContext {
	readonly userExtensionConfig: UserExtensionConfigGateway;
	readonly declaredExtensions: DeclaredExtensionsGateway;
}

export interface UserExtensionAvailabilityContext {
	readonly userExtensionAvailability: UserExtensionAvailabilityGateway;
}

export interface PreparedUserConfig {
	readonly configPath: string;
	readonly configDir: string;
	readonly content: string;
	readonly expected: ExpectedUserExtensionConfigState;
}

export async function prepareUserConfig<TResult>(
	context: UserExtensionLifecycleContext,
	operation: string,
): Promise<PreparedUserConfig | ClinkrExit<TResult>> {
	const read = await context.userExtensionConfig.read();
	if (read.type === "error") {
		return failure(`ns-extension-${operation}-user-config-unavailable`, read.error.message, {
			scope: "user",
			diagnostics: [read.error],
		});
	}
	if (read.type === "not-file") {
		return failure(
			`ns-extension-${operation}-user-config-invalid`,
			`${read.configPath} exists but is not a file.`,
			{
				scope: "user",
				diagnostics: [
					{
						code: "user-config-not-file",
						message: `${read.configPath} exists but is not a file.`,
						path: read.configPath,
					},
				],
			},
		);
	}
	return {
		configPath: read.configPath,
		configDir: read.configDir,
		content: read.type === "file" ? read.content : "",
		expected: read.type === "file" ? { type: "file", content: read.content } : { type: "missing" },
	};
}

export function prepareUserLocalSource<TResult>(options: {
	readonly cwd: string;
	readonly source: string;
	readonly operation: string;
}):
	| { readonly ok: true; readonly sourceSpec: string }
	| { readonly ok: false; readonly exit: ClinkrExit<TResult> } {
	const classified = classifyExtensionSourceLifecycle(options.cwd, options.source);
	if (classified.type === "supported-local") {
		return { ok: true, sourceSpec: classified.source.path };
	}
	if (classified.type === "supported-npm") {
		return {
			ok: false,
			exit: failure(
				`ns-extension-${options.operation}-user-npm-managed-storage-unavailable`,
				`User-scoped npm extension lifecycle is not available until managed npm storage is implemented: ${options.source}. Use a local extension path or manage this declaration manually.`,
				{
					scope: "user",
					sourceSpec: options.source,
					code: "user-npm-managed-storage-unavailable",
					nextCommand: `ns extension ${options.operation} <local-path> --scope user`,
				},
			),
		};
	}
	const message =
		classified.type === "invalid-npm" ? classified.diagnostic.message : classified.message;
	return {
		ok: false,
		exit: failure(`ns-extension-${options.operation}-user-source-invalid`, message, {
			scope: "user",
			sourceSpec: options.source,
			code: "user-extension-source-invalid",
		}),
	};
}

export async function loadOneUserLocalDescriptor<TResult>(options: {
	readonly context: UserExtensionLifecycleContext;
	readonly configDir: string;
	readonly sourceSpec: string;
	readonly operation: string;
}): Promise<
	| {
			readonly ok: true;
			readonly descriptor: Awaited<
				ReturnType<DeclaredExtensionsGateway["load"]>
			>["descriptors"][number];
	  }
	| { readonly ok: false; readonly exit: ClinkrExit<TResult> }
> {
	const loaded = await options.context.declaredExtensions.load({
		repoRoot: options.configDir,
		specs: [options.sourceSpec],
		localPathPolicy: "absolute-only",
		resolveNpmPackageRoot: () => undefined,
	});
	const descriptor = loaded.descriptors[0];
	if (
		descriptor !== undefined &&
		descriptor.spec === options.sourceSpec &&
		loaded.descriptors.length === 1 &&
		loaded.diagnostics.length === 0
	) {
		return { ok: true, descriptor };
	}
	const diagnostic = loaded.diagnostics[0] ?? {
		severity: "error" as const,
		code: "extension-descriptor-status-unavailable",
		message: `No descriptor was returned for ${options.sourceSpec}.`,
		spec: options.sourceSpec,
	};
	return {
		ok: false,
		exit: failure(`ns-extension-${options.operation}-user-descriptor-invalid`, diagnostic.message, {
			scope: "user",
			sourceSpec: options.sourceSpec,
			diagnostics: loaded.diagnostics.length === 0 ? [diagnostic] : loaded.diagnostics,
		}),
	};
}
