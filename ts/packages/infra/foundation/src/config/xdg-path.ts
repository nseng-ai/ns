import { isAbsolute, join } from "node:path";

import { optionalEntry, type ExplicitUndefined } from "../primitives/primitives.ts";
import { err, ok, type Result } from "../primitives/result.ts";

export type XdgDirectoryKind = "config" | "data" | "state" | "cache";

export interface XdgPathError {
	code: "home-not-set" | "home-not-absolute" | "override-not-absolute";
	message: string;
}

export interface XdgPathOptions {
	kind: XdgDirectoryKind;
	env: Record<string, string | undefined>;
	segments?: readonly string[];
	overrideEnv?: string;
}

export interface MergeXdgHomeEnvOptions {
	baseEnv: Record<string, string | undefined>;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	xdgHomeDir?: string;
}

const XDG_ENV_BY_KIND = {
	config: "XDG_CONFIG_HOME",
	data: "XDG_DATA_HOME",
	state: "XDG_STATE_HOME",
	cache: "XDG_CACHE_HOME",
} as const satisfies Record<XdgDirectoryKind, string>;

const XDG_DEFAULT_SEGMENTS_BY_KIND = {
	config: [".config"],
	data: [".local", "share"],
	state: [".local", "state"],
	cache: [".cache"],
} as const satisfies Record<XdgDirectoryKind, readonly string[]>;

export function mergeXdgHomeEnv(
	options: MergeXdgHomeEnvOptions,
): Record<string, string | undefined> {
	return {
		...options.baseEnv,
		...(options.env ?? {}),
		...optionalEntry("HOME", options.xdgHomeDir),
	};
}

export function resolveXdgHome(
	kind: XdgDirectoryKind,
	env: Record<string, string | undefined>,
): Result<string, XdgPathError> {
	const xdgValue = env[XDG_ENV_BY_KIND[kind]];
	if (xdgValue !== undefined && xdgValue.length > 0 && isAbsolute(xdgValue)) {
		return ok(xdgValue);
	}

	const home = env["HOME"];
	if (home === undefined || home.length === 0) {
		return err({
			code: "home-not-set",
			message: `HOME environment variable is not set; cannot resolve default ${XDG_ENV_BY_KIND[kind]}.`,
		});
	}
	if (!isAbsolute(home)) {
		return err({
			code: "home-not-absolute",
			message: `HOME environment variable must be absolute to resolve default ${XDG_ENV_BY_KIND[kind]}: ${home}`,
		});
	}
	return ok(join(home, ...XDG_DEFAULT_SEGMENTS_BY_KIND[kind]));
}

export function resolveNsXdgPath(options: XdgPathOptions): Result<string, XdgPathError> {
	if (options.overrideEnv !== undefined) {
		const override = resolvePathOverride({ env: options.env, name: options.overrideEnv });
		if (!override.ok) return override;
		if (override.value !== undefined) return ok(join(override.value, ...(options.segments ?? [])));
	}

	const home = resolveXdgHome(options.kind, options.env);
	if (!home.ok) return home;
	return ok(join(home.value, "ns", ...(options.segments ?? [])));
}

export function requireXdgPath(result: Result<string, XdgPathError>): string {
	if (result.ok) return result.value;
	throw new Error(result.error.message);
}

export function requireNsStatePath(options: {
	env: Record<string, string | undefined>;
	overrideEnvName: string;
	segments: readonly string[];
}): string {
	const override = resolvePathOverride({ env: options.env, name: options.overrideEnvName });
	if (!override.ok) throw new Error(override.error.message);
	if (override.value !== undefined) return override.value;
	return requireXdgPath(
		resolveNsXdgPath({ kind: "state", env: options.env, segments: options.segments }),
	);
}

export function resolvePathOverride(options: {
	env: Record<string, string | undefined>;
	name: string;
}): Result<string | undefined, XdgPathError> {
	const rawValue = options.env[options.name];
	if (rawValue === undefined || rawValue.trim() === "") return ok(undefined);

	const expanded = expandHomeRelativePath(rawValue.trim(), options.env);
	if (!expanded.ok) return expanded;
	if (!isAbsolute(expanded.value)) {
		return err({
			code: "override-not-absolute",
			message: `${options.name} must be an absolute path after optional ~/ expansion: ${rawValue}`,
		});
	}
	return ok(expanded.value);
}

function expandHomeRelativePath(
	path: string,
	env: Record<string, string | undefined>,
): Result<string, XdgPathError> {
	if (!path.startsWith("~/")) return ok(path);
	const home = env["HOME"];
	if (home === undefined || home.length === 0) {
		return err({
			code: "home-not-set",
			message: "HOME environment variable is not set; cannot expand ~/ in storage override.",
		});
	}
	if (!isAbsolute(home)) {
		return err({
			code: "home-not-absolute",
			message: `HOME environment variable must be absolute to expand ~/ in storage override: ${home}`,
		});
	}
	return ok(join(home, path.slice(2)));
}
