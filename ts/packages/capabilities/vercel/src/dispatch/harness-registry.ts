// Dependency-light source of truth for dispatch harness support. Both the
// repo-local config boundary and the remote invocation resolver derive from
// this registry, so a harness is accepted only when it has a complete recipe.

import type { SandboxCommand } from "../sandbox/contracts.ts";

export const DISPATCH_SETTINGS_PATH = "ns.toml";
export const DISPATCH_PACKAGE_MANIFEST_PATH = "ts/package.json";
export const DISPATCH_PACKAGE_MANAGER_FIELD =
	`${DISPATCH_PACKAGE_MANIFEST_PATH}#packageManager` as const;

/** Checkout-relative entry module for the ns-owned Pi runner. */
export const PI_RUNNER_ENTRY_PATH = "ts/packages/capabilities/vercel/src/pi-runner/main.ts";

/** Environment variable carrying the Vercel AI Gateway key into the sandbox launch. */
export const PI_SANDBOX_MODEL_KEY_ENV_NAME = "AI_GATEWAY_API_KEY";

/** Pi provider id for the Vercel AI Gateway built-in provider. */
export const PI_SANDBOX_MODEL_PROVIDER = "vercel-ai-gateway";

/** Exact gateway model the sandbox Pi session is pinned to. */
export const PI_SANDBOX_MODEL_ID = "anthropic/claude-opus-4.6";

/**
 * Sandbox-global Pi settings JSON pinning the model. Written to the sandbox
 * home (never the checkout), so pi's default resolution cannot fall back to
 * catalog order and repo-local `.pi/settings.json` stays untouched for humans.
 */
export function buildPiSandboxSettingsJson(): string {
	return JSON.stringify({
		defaultProvider: PI_SANDBOX_MODEL_PROVIDER,
		defaultModel: PI_SANDBOX_MODEL_ID,
	});
}

export interface HarnessInvocation {
	/** Validated configured harness represented by this invocation. */
	readonly harness: DispatchHarness;
	/** Sequential provisioning commands; each must exit 0. */
	readonly provisionCommands: readonly SandboxCommand[];
	/** The detached, headless harness launch command. */
	readonly launchCommand: SandboxCommand;
	/** Deployable environment-variable names copied into the launch command. */
	readonly launchEnvironmentVariableNames: readonly string[];
}

declare const validatedPnpmVersionBrand: unique symbol;

/** An exact stable pnpm semver returned only by the package-manager parser. */
export type ValidatedPnpmVersion = string & {
	readonly [validatedPnpmVersionBrand]: "ValidatedPnpmVersion";
};

export type DispatchPackageManagerFailureCode =
	| "package-manifest-missing"
	| "package-manifest-invalid"
	| "package-manager-missing"
	| "package-manager-invalid";

export interface DispatchPackageManagerFailure {
	readonly code: DispatchPackageManagerFailureCode;
	readonly field: typeof DISPATCH_PACKAGE_MANAGER_FIELD;
	readonly message: string;
}

export type DispatchPackageManagerParseResult =
	| { readonly ok: true; readonly value: { readonly pnpmVersion: ValidatedPnpmVersion } }
	| { readonly ok: false; readonly error: DispatchPackageManagerFailure };

const EXACT_STABLE_PNPM_PACKAGE_MANAGER = /^pnpm@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

/**
 * Parse the checkout's package-manager contract. `null` is the explicit
 * missing-file state. Failures never echo manifest content or field values.
 */
export function parseDispatchPackageManagerSource(
	manifestSource: string | null,
): DispatchPackageManagerParseResult {
	if (manifestSource === null) {
		return packageManagerFailure(
			"package-manifest-missing",
			`${DISPATCH_PACKAGE_MANAGER_FIELD} is unavailable because ${DISPATCH_PACKAGE_MANIFEST_PATH} is missing.`,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(manifestSource);
	} catch {
		return packageManagerFailure(
			"package-manifest-invalid",
			`${DISPATCH_PACKAGE_MANAGER_FIELD} is unavailable because ${DISPATCH_PACKAGE_MANIFEST_PATH} is not valid JSON.`,
		);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return packageManagerFailure(
			"package-manifest-invalid",
			`${DISPATCH_PACKAGE_MANAGER_FIELD} is unavailable because ${DISPATCH_PACKAGE_MANIFEST_PATH} is not a JSON object.`,
		);
	}

	const packageManager = (parsed as Record<string, unknown>)["packageManager"];
	if (packageManager === undefined) {
		return packageManagerFailure(
			"package-manager-missing",
			`${DISPATCH_PACKAGE_MANAGER_FIELD} is missing; set it to pnpm@<stable-exact-semver>.`,
		);
	}
	if (typeof packageManager !== "string") {
		return packageManagerFailure(
			"package-manager-invalid",
			`${DISPATCH_PACKAGE_MANAGER_FIELD} must be pnpm@<stable-exact-semver>.`,
		);
	}

	const match = EXACT_STABLE_PNPM_PACKAGE_MANAGER.exec(packageManager);
	const pnpmVersion = match?.[1];
	if (pnpmVersion === undefined) {
		return packageManagerFailure(
			"package-manager-invalid",
			`${DISPATCH_PACKAGE_MANAGER_FIELD} must be pnpm@<stable-exact-semver>.`,
		);
	}
	return {
		ok: true,
		value: { pnpmVersion: pnpmVersion as ValidatedPnpmVersion },
	};
}

function packageManagerFailure(
	code: DispatchPackageManagerFailureCode,
	message: string,
): DispatchPackageManagerParseResult {
	return {
		ok: false,
		error: { code, field: DISPATCH_PACKAGE_MANAGER_FIELD, message },
	};
}

interface DispatchHarnessRegistryEntry {
	readonly buildInvocation: (pnpmVersion: ValidatedPnpmVersion) => HarnessInvocation;
}

const dispatchHarnessRegistry = {
	pi: {
		buildInvocation: buildPiHarnessInvocation,
	},
} as const satisfies Record<string, DispatchHarnessRegistryEntry>;

export type DispatchHarness = keyof typeof dispatchHarnessRegistry;

/** Runtime values accepted by repo-local dispatch configuration. */
export const dispatchHarnessValues = registryKeys(dispatchHarnessRegistry);

export function isDispatchHarness(value: unknown): value is DispatchHarness {
	return (
		typeof value === "string" &&
		Object.prototype.hasOwnProperty.call(dispatchHarnessRegistry, value)
	);
}

export function buildDispatchHarnessInvocation(options: {
	readonly harness: DispatchHarness;
	readonly pnpmVersion: ValidatedPnpmVersion;
}): HarnessInvocation {
	return dispatchHarnessRegistry[options.harness].buildInvocation(options.pnpmVersion);
}

/** Build the Pi provisioning and launch recipe from the validated pnpm version. */
export function buildPiHarnessInvocation(pnpmVersion: ValidatedPnpmVersion): HarnessInvocation {
	return {
		harness: "pi",
		provisionCommands: [
			{ cmd: "git", args: ["config", "--global", "user.name", "ns-dispatch"] },
			{
				cmd: "git",
				args: ["config", "--global", "user.email", "ns-dispatch[bot]@users.noreply.github.com"],
			},
			{ cmd: "npm", args: ["install", "--global", `pnpm@${pnpmVersion}`] },
			{
				cmd: "pnpm",
				args: ["--dir", "ts", "install", "--frozen-lockfile", "--filter", "@nseng-ai/vercel..."],
			},
			{
				cmd: "sh",
				args: [
					"-c",
					`mkdir -p "$HOME/.pi/agent" && printf '%s' '${buildPiSandboxSettingsJson()}' > "$HOME/.pi/agent/settings.json"`,
				],
			},
		],
		launchCommand: { cmd: "node", args: [PI_RUNNER_ENTRY_PATH] },
		launchEnvironmentVariableNames: [PI_SANDBOX_MODEL_KEY_ENV_NAME],
	};
}

function registryKeys<TRegistry extends Readonly<Record<string, unknown>>>(
	registry: TRegistry,
): readonly Extract<keyof TRegistry, string>[] {
	return Object.freeze(Object.keys(registry)) as readonly Extract<keyof TRegistry, string>[];
}
