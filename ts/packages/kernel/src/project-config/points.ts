import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "smol-toml";
import { z, type ZodType } from "zod";

export type PointAccepts = "hook" | "prompt";
export type PointSemantics = "additive" | "override";

export type PointDefinition = {
	id: string;
	accepts: PointAccepts;
	semantics: PointSemantics;
};

export type SettingsSchema = {
	path: readonly [string, ...string[]];
	schema: ZodType;
};

export type ProjectConfigGateway = {
	readTextFile: (request: { repoRoot: string; relativePath: "ns.toml" }) => ProjectConfigReadResult;
};

export type ProjectConfigReadResult =
	| { type: "found"; text: string }
	| { type: "missing" }
	| { type: "error"; message: string };

export type ProjectConfigDiagnostic = {
	severity: "error";
	code: string;
	message: string;
	path?: string;
};

export type ProjectPointInstallation =
	| { pointId: string; accepts: "hook"; commands: readonly string[] }
	| { pointId: string; accepts: "prompt"; path: string };

export type LoadedProjectConfig = {
	points: readonly ProjectPointInstallation[];
	settings: ReadonlyMap<string, unknown>;
};

export type LoadProjectConfigResult =
	| { ok: true; config: LoadedProjectConfig; diagnostics: readonly ProjectConfigDiagnostic[] }
	| { ok: false; diagnostics: readonly ProjectConfigDiagnostic[] };

export const nodeProjectConfigGateway: ProjectConfigGateway = {
	readTextFile(request) {
		try {
			return {
				type: "found",
				text: readFileSync(join(request.repoRoot, request.relativePath), "utf8"),
			};
		} catch (error) {
			if (isNodeFileNotFound(error)) return { type: "missing" };
			return { type: "error", message: formatUnknownError(error) };
		}
	},
};

export function loadProjectConfig(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
	pointDefinitions: readonly PointDefinition[];
	settingsSchemas?: readonly SettingsSchema[];
}): LoadProjectConfigResult {
	const readResult = request.gateway.readTextFile({
		repoRoot: request.repoRoot,
		relativePath: "ns.toml",
	});
	if (readResult.type === "missing") {
		return {
			ok: true,
			config: { points: [], settings: new Map() },
			diagnostics: [],
		};
	}
	if (readResult.type === "error") {
		return {
			ok: false,
			diagnostics: [
				diagnostic("ns_toml_read_failed", `Failed to read ns.toml: ${readResult.message}`),
			],
		};
	}
	return parseProjectConfigToml(readResult.text, {
		pathLabel: "ns.toml",
		pointDefinitions: request.pointDefinitions,
		settingsSchemas: request.settingsSchemas ?? [],
	});
}

export function parseProjectConfigToml(
	source: string,
	request: {
		pathLabel?: string;
		pointDefinitions: readonly PointDefinition[];
		settingsSchemas?: readonly SettingsSchema[];
	},
): LoadProjectConfigResult {
	const pathLabel = request.pathLabel ?? "ns.toml";
	let parsed: unknown;
	try {
		parsed = parse(source);
	} catch (error) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("ns_toml_invalid", `${pathLabel}: Invalid TOML.\n${formatUnknownError(error)}`),
			],
		};
	}

	const documentResult = tomlDocumentSchema.safeParse(parsed);
	if (!documentResult.success) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("ns_toml_invalid", `${pathLabel}: top-level TOML document must be a table.`),
			],
		};
	}

	const diagnostics: ProjectConfigDiagnostic[] = [];
	const document = documentResult.data;
	const points = parsePointsTable({
		pathLabel,
		value: document["points"],
		pointDefinitions: request.pointDefinitions,
		diagnostics,
	});
	const settings = parseDeclaredSettings({
		pathLabel,
		document,
		settingsSchemas: request.settingsSchemas ?? [],
		diagnostics,
	});

	if (diagnostics.length > 0) return { ok: false, diagnostics };
	return { ok: true, config: { points, settings }, diagnostics: [] };
}

function parsePointsTable(request: {
	pathLabel: string;
	value: unknown;
	pointDefinitions: readonly PointDefinition[];
	diagnostics: ProjectConfigDiagnostic[];
}): readonly ProjectPointInstallation[] {
	if (request.value === undefined) return [];
	const tableResult = recordSchema.safeParse(request.value);
	if (!tableResult.success) {
		request.diagnostics.push(
			diagnostic("points_table_invalid", `${request.pathLabel}: [points] must be a TOML table.`, {
				path: "points",
			}),
		);
		return [];
	}

	const definitions = new Map(
		request.pointDefinitions.map((definition) => [definition.id, definition]),
	);
	const installations: ProjectPointInstallation[] = [];
	for (const [pointId, value] of Object.entries(tableResult.data)) {
		const definition = definitions.get(pointId);
		if (definition === undefined) {
			request.diagnostics.push(
				diagnostic(
					"point_installation_undefined",
					`${request.pathLabel}: [points].${JSON.stringify(pointId)} installs an undefined point.`,
					{ path: `points.${pointId}` },
				),
			);
			continue;
		}
		const parsed = parsePointInstallation({
			pathLabel: request.pathLabel,
			pointId,
			definition,
			value,
		});
		if (parsed.ok) installations.push(parsed.installation);
		else request.diagnostics.push(parsed.diagnostic);
	}
	return installations;
}

function parsePointInstallation(request: {
	pathLabel: string;
	pointId: string;
	definition: PointDefinition;
	value: unknown;
}):
	| { ok: true; installation: ProjectPointInstallation }
	| { ok: false; diagnostic: ProjectConfigDiagnostic } {
	if (request.definition.accepts === "hook") {
		const valueResult = z.array(z.string()).safeParse(request.value);
		if (!valueResult.success) {
			return {
				ok: false,
				diagnostic: diagnostic(
					"point_installation_invalid",
					`${request.pathLabel}: hook point ${request.pointId} must be an array of command strings.`,
					{ path: `points.${request.pointId}` },
				),
			};
		}
		return {
			ok: true,
			installation: { pointId: request.pointId, accepts: "hook", commands: valueResult.data },
		};
	}

	const valueResult = z.string().min(1).safeParse(request.value);
	if (!valueResult.success) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"point_installation_invalid",
				`${request.pathLabel}: prompt point ${request.pointId} must be a non-empty path string.`,
				{ path: `points.${request.pointId}` },
			),
		};
	}
	return {
		ok: true,
		installation: { pointId: request.pointId, accepts: "prompt", path: valueResult.data },
	};
}

function parseDeclaredSettings(request: {
	pathLabel: string;
	document: Record<string, unknown>;
	settingsSchemas: readonly SettingsSchema[];
	diagnostics: ProjectConfigDiagnostic[];
}): ReadonlyMap<string, unknown> {
	const settings = new Map<string, unknown>();
	for (const setting of request.settingsSchemas) {
		const settingValue = valueAtPath(request.document, setting.path);
		if (settingValue === undefined) continue;
		const schemaResult = setting.schema.safeParse(settingValue);
		const key = setting.path.join(".");
		if (!schemaResult.success) {
			request.diagnostics.push(
				diagnostic(
					"settings_table_invalid",
					`${request.pathLabel}: [${key}] does not match its declared settings schema.`,
					{ path: key },
				),
			);
			continue;
		}
		settings.set(key, schemaResult.data);
	}
	return settings;
}

function valueAtPath(
	document: Record<string, unknown>,
	path: readonly [string, ...string[]],
): unknown {
	let current: unknown = document;
	for (const segment of path) {
		const tableResult = recordSchema.safeParse(current);
		if (!tableResult.success) return undefined;
		current = tableResult.data[segment];
		if (current === undefined) return undefined;
	}
	return current;
}

function diagnostic(
	code: string,
	message: string,
	options: { path?: string } = {},
): ProjectConfigDiagnostic {
	return {
		severity: "error",
		code,
		message,
		...(options.path === undefined ? {} : { path: options.path }),
	};
}

function isNodeFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

const recordSchema = z.record(z.string(), z.unknown());
const tomlDocumentSchema = recordSchema;
