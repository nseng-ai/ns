import { failure } from "@nseng-ai/clinkr/legacy";
import type { ClinkrExit } from "@nseng-ai/clinkr/legacy";
import {
	classifyExtensionSourceLifecycle,
	managedNpmPackagePaths,
	type ExtensionSourceSpec,
	type ManagedNpmStorage,
} from "@nseng-ai/sdk/project-config";

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

export type UserManagedNpmStorageResolution =
	| { readonly type: "available"; readonly storage: ManagedNpmStorage }
	| {
			readonly type: "unavailable";
			readonly diagnostic: {
				readonly code: "user-managed-npm-storage-unavailable";
				readonly message: string;
			};
	  };

export interface UserExtensionLifecycleContext {
	readonly userExtensionConfig: UserExtensionConfigGateway;
	readonly declaredExtensions: DeclaredExtensionsGateway;
	readonly userManagedNpmStorage: UserManagedNpmStorageResolution;
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

export function prepareUserExtensionSource<TResult>(options: {
	readonly context: UserExtensionLifecycleContext;
	readonly cwd: string;
	readonly source: string;
	readonly operation: string;
}):
	| { readonly ok: true; readonly sourceSpec: string; readonly source: ExtensionSourceSpec }
	| { readonly ok: false; readonly exit: ClinkrExit<TResult> } {
	const classified = classifyExtensionSourceLifecycle(options.cwd, options.source);
	if (classified.type === "supported-local") {
		return { ok: true, sourceSpec: classified.source.path, source: classified.source };
	}
	if (classified.type === "supported-npm") {
		if (options.context.userManagedNpmStorage.type === "available") {
			return { ok: true, sourceSpec: classified.source.raw, source: classified.source };
		}
		return {
			ok: false,
			exit: failure(
				`ns-extension-${options.operation}-user-managed-npm-storage-unavailable`,
				options.context.userManagedNpmStorage.diagnostic.message,
				{
					scope: "user",
					sourceSpec: options.source,
					diagnostic: options.context.userManagedNpmStorage.diagnostic,
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

export async function loadOneUserDescriptor<TResult>(options: {
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
		resolveNpmPackageRoot: (packageName) =>
			options.context.userManagedNpmStorage.type === "available"
				? managedNpmPackagePaths(options.context.userManagedNpmStorage.storage, packageName)
						.packageRoot
				: undefined,
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
