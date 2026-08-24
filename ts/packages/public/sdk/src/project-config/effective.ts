import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { RealGitGateway, type GitOptionalResult } from "@nseng-ai/foundation/git";
import { formatErrorMessage, optionalEntry } from "@nseng-ai/foundation/primitives";
import type {
	EffectiveProjectConfig,
	ProjectConfigError,
	ProjectSetting,
} from "../sdk/project-config.ts";
import { getProjectConfigSetting, parseProjectConfigToml } from "./points.ts";

export interface EffectiveProjectConfigScope {
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	readonly commands: CommandExecApi;
	readonly signal?: AbortSignal;
}

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

interface ProjectConfigSnapshot {
	readonly path: string;
	readonly source?: string;
}

type SnapshotResult = Result<ProjectConfigSnapshot, ProjectConfigError>;

interface EffectiveProjectConfigDependencies {
	readonly discoverRoot: (scope: EffectiveProjectConfigScope) => Promise<GitOptionalResult<string>>;
	readonly readTextFile: (path: string, signal?: AbortSignal) => Promise<string | undefined>;
}

export function createNodeEffectiveProjectConfig(
	scope: EffectiveProjectConfigScope,
): EffectiveProjectConfig {
	const copiedScope: EffectiveProjectConfigScope = {
		cwd: scope.cwd,
		env: { ...scope.env },
		commands: scope.commands,
		...optionalEntry("signal", scope.signal),
	};
	const git = new RealGitGateway(copiedScope.commands);
	return createEffectiveProjectConfig(copiedScope, {
		discoverRoot: ({ cwd, env, signal }) =>
			git.optionalRepoRoot({ cwd, env: { ...env }, ...optionalEntry("signal", signal) }),
		readTextFile: readOptionalTextFile,
	});
}

/** Internal fake-driven construction seam. Not exported from the package surface. */
export function createEffectiveProjectConfig(
	scope: EffectiveProjectConfigScope,
	dependencies: EffectiveProjectConfigDependencies,
): EffectiveProjectConfig {
	const copiedScope: EffectiveProjectConfigScope = {
		cwd: scope.cwd,
		env: { ...scope.env },
		commands: scope.commands,
		...optionalEntry("signal", scope.signal),
	};
	let snapshotPromise: Promise<SnapshotResult> | undefined;

	return {
		async get<T>(setting: ProjectSetting<T>) {
			snapshotPromise ??= loadSnapshot(copiedScope, dependencies);
			const snapshot = await snapshotPromise;
			if (!snapshot.ok) return snapshot;
			if (snapshot.value.source === undefined) return { ok: true, value: undefined };

			const parsed = parseProjectConfigToml(snapshot.value.source, {
				pathLabel: snapshot.value.path,
				pointsTable: { mode: "skip" },
				settingsSchemas: [setting],
			});
			if (!parsed.ok) {
				const invalidSource = parsed.diagnostics.some(
					(diagnostic) => diagnostic.code === "ns_toml_invalid",
				);
				if (invalidSource) {
					return {
						ok: false,
						error: {
							code: "invalid-source",
							path: snapshot.value.path,
							diagnostics: parsed.diagnostics,
						},
					};
				}
				return {
					ok: false,
					error: {
						code: "invalid-setting",
						path: snapshot.value.path,
						settingPath: [...setting.path],
						message:
							parsed.diagnostics[0]?.message ??
							`${snapshot.value.path}: [${setting.path.join(".")}] is invalid.`,
					},
				};
			}
			const value = getProjectConfigSetting(parsed.config, setting);
			if (value === undefined) return { ok: true, value: undefined };
			return {
				ok: true,
				value: {
					value,
					provenance: {
						source: "project",
						path: snapshot.value.path,
						settingPath: [...setting.path],
					},
				},
			};
		},
	};
}

async function loadSnapshot(
	scope: EffectiveProjectConfigScope,
	dependencies: EffectiveProjectConfigDependencies,
): Promise<SnapshotResult> {
	const root = await dependencies.discoverRoot(scope);
	if (root.type === "missing") {
		return { ok: false, error: { code: "project-not-found", cwd: scope.cwd } };
	}
	if (root.type === "error") {
		return {
			ok: false,
			error: {
				code: "project-discovery-failed",
				cwd: scope.cwd,
				message: root.error.message,
			},
		};
	}
	const path = resolve(root.value, "ns.toml");
	try {
		const source = await dependencies.readTextFile(path, scope.signal);
		return {
			ok: true,
			value: { path, ...optionalEntry("source", source) },
		};
	} catch (error) {
		return {
			ok: false,
			error: { code: "source-read-failed", path, message: formatErrorMessage(error) },
		};
	}
}

async function readOptionalTextFile(
	path: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	try {
		return await readFile(path, { encoding: "utf8", ...optionalEntry("signal", signal) });
	} catch (error) {
		if (isNodeFileNotFound(error)) return undefined;
		throw error;
	}
}

function isNodeFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}
