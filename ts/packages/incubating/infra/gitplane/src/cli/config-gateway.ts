import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type {
	ArtifactKindRegistration,
	ArtifactSchemaRegistration,
	GitplaneConfig,
	ProjectionField,
} from "../core/index.ts";

const projectionSchema = z
	.object({ target: z.string().min(1), mode: z.literal("json").optional() })
	.strict();
const targetSchema = z
	.object({
		table: z.string().min(1),
		lineage: z
			.object({
				sourceId: z.string().min(1),
				artifactId: z.string().min(1),
				revisionId: z.string().min(1),
				path: z.string().min(1),
				deleted: z.string().min(1),
				deletedAtCommit: z.string().min(1),
			})
			.strict(),
	})
	.strict();
const schemaRegistrationSchema = z
	.object({
		fields: z.record(z.string(), projectionSchema),
		clearFields: z.array(z.string().min(1)).optional(),
	})
	.strict();
const kindSchema = z
	.object({
		apiVersion: z.string().min(1),
		kind: z.string().min(1),
		schemaVersions: z.record(z.string(), schemaRegistrationSchema),
		transitions: z.array(
			z.object({ from: z.number().int().positive(), to: z.number().int().positive() }).strict(),
		),
		target: targetSchema,
	})
	.strict();
const configSchema = z
	.object({
		source: z.object({ id: z.string().min(1), artifactRoot: z.string().min(1) }).strict(),
		kinds: z.array(kindSchema).optional(),
		store: z.custom<GitplaneConfig["store"]>(
			(value) => typeof value === "function",
			"store must be callable",
		),
	})
	.strict();

export type ConfigLoadFailureCategory = "config-load" | "config-invalid" | "source-root-invalid";
export type ConfigLoadResult =
	| { readonly ok: true; readonly config: GitplaneConfig; readonly artifactRoot: string }
	| {
			readonly ok: false;
			readonly category: ConfigLoadFailureCategory;
			readonly diagnostic: string;
			readonly path?: string;
	  };
export interface GitplaneConfigGateway {
	load(request: { readonly cwd: string; readonly configPath?: string }): Promise<ConfigLoadResult>;
}

interface ParsedConfigModule {
	readonly ok: true;
	readonly config: GitplaneConfig;
	readonly artifactRoot: string;
	readonly absoluteArtifactRoot: string;
}
type ConfigLoadFailure = Exclude<ConfigLoadResult, { ok: true }>;
export type ConfigModuleParseResult = ParsedConfigModule | ConfigLoadFailure;

function logicalRelative(cwd: string, value: string): string {
	return path.relative(cwd, value).split(path.sep).join("/") || ".";
}
function configInvalid(diagnostic: string, configPath: string): ConfigModuleParseResult {
	return { ok: false, category: "config-invalid", diagnostic, path: configPath };
}
function rootInvalid(diagnostic: string, root: string): ConfigLoadFailure {
	return { ok: false, category: "source-root-invalid", diagnostic, path: root };
}

export function parseGitplaneConfigModule(
	imported: unknown,
	request: { readonly cwd: string; readonly configPath?: string },
): ConfigModuleParseResult {
	const cwd = path.resolve(request.cwd);
	const configPath = path.resolve(cwd, request.configPath ?? "gitplane.config.ts");
	const logicalConfigPath = logicalRelative(cwd, configPath);
	if (typeof imported !== "object" || imported === null || !("default" in imported))
		return {
			ok: false,
			category: "config-load",
			diagnostic: "Configuration module must have a default export.",
			path: logicalConfigPath,
		};
	const parsed = configSchema.safeParse(imported.default);
	if (!parsed.success)
		return configInvalid(
			parsed.error.issues
				.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
				.join("; "),
			logicalConfigPath,
		);

	const pairs = new Set<string>();
	for (const kind of parsed.data.kinds ?? []) {
		const pair = `${kind.apiVersion}\0${kind.kind}`;
		if (pairs.has(pair))
			return configInvalid("Kind registrations must be unique.", logicalConfigPath);
		pairs.add(pair);
		const versions = Object.keys(kind.schemaVersions);
		if (versions.length === 0 || versions.some((key) => !/^[1-9]\d*$/.test(key)))
			return configInvalid(
				"Schema version keys must be unique positive integers.",
				logicalConfigPath,
			);
		const edges = new Set<string>();
		for (const edge of kind.transitions) {
			const key = `${edge.from}:${edge.to}`;
			if (
				edge.from === edge.to ||
				edges.has(key) ||
				!(String(edge.from) in kind.schemaVersions) ||
				!(String(edge.to) in kind.schemaVersions)
			)
				return configInvalid(
					"Transitions must be unique, non-self edges between declared schema versions.",
					logicalConfigPath,
				);
			edges.add(key);
		}
	}
	if (path.isAbsolute(parsed.data.source.artifactRoot))
		return configInvalid("source.artifactRoot must be relative.", logicalConfigPath);
	const absoluteArtifactRoot = path.resolve(
		path.dirname(configPath),
		parsed.data.source.artifactRoot,
	);
	const artifactRoot = logicalRelative(cwd, absoluteArtifactRoot);
	if (absoluteArtifactRoot !== cwd && !absoluteArtifactRoot.startsWith(`${cwd}${path.sep}`))
		return rootInvalid("Artifact root must be within the invocation directory.", artifactRoot);

	const kinds: ArtifactKindRegistration[] | undefined = parsed.data.kinds?.map((kind) => {
		const schemaVersions: Record<number, ArtifactSchemaRegistration> = {};
		for (const [key, registration] of Object.entries(kind.schemaVersions)) {
			const fields: Record<string, ProjectionField> = {};
			for (const [pointer, field] of Object.entries(registration.fields))
				fields[pointer] = {
					target: field.target,
					...(field.mode === undefined ? {} : { mode: field.mode }),
				};
			schemaVersions[Number(key)] = {
				fields,
				...(registration.clearFields === undefined
					? {}
					: { clearFields: [...registration.clearFields] }),
			};
		}
		return {
			apiVersion: kind.apiVersion,
			kind: kind.kind,
			schemaVersions,
			transitions: kind.transitions.map((edge) => ({ ...edge })),
			target: { table: kind.target.table, lineage: { ...kind.target.lineage } },
		};
	});
	const config: GitplaneConfig = {
		source: parsed.data.source,
		store: parsed.data.store,
		...(kinds === undefined ? {} : { kinds }),
	};
	return { ok: true, config, artifactRoot, absoluteArtifactRoot };
}

export class TrustedTypeScriptConfigGateway implements GitplaneConfigGateway {
	async load(request: {
		readonly cwd: string;
		readonly configPath?: string;
	}): Promise<ConfigLoadResult> {
		const cwd = path.resolve(request.cwd);
		const configPath = path.resolve(cwd, request.configPath ?? "gitplane.config.ts");
		const logicalConfigPath = logicalRelative(cwd, configPath);
		let imported: unknown;
		try {
			imported = await import(pathToFileURL(configPath).href);
		} catch {
			return {
				ok: false,
				category: "config-load",
				diagnostic: "Unable to load configuration module.",
				path: logicalConfigPath,
			};
		}
		const parsed = parseGitplaneConfigModule(imported, request);
		if (!parsed.ok) return parsed;
		try {
			const [facts, realRoot, realCwd] = await Promise.all([
				lstat(parsed.absoluteArtifactRoot),
				realpath(parsed.absoluteArtifactRoot),
				realpath(cwd),
			]);
			if (
				!facts.isDirectory() ||
				facts.isSymbolicLink() ||
				(realRoot !== realCwd && !realRoot.startsWith(`${realCwd}${path.sep}`))
			)
				return rootInvalid(
					"Artifact root must be a real directory within the invocation directory.",
					parsed.artifactRoot,
				);
		} catch {
			return rootInvalid("Artifact root is not readable.", parsed.artifactRoot);
		}
		return { ok: true, config: parsed.config, artifactRoot: parsed.artifactRoot };
	}
}
