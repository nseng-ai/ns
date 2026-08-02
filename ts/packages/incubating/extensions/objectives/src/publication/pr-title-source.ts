import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { ExtensionDescriptor } from "@nseng-ai/sdk";
import {
	loadPointCatalog,
	nodeProjectConfigGateway,
	resolveTextContentPointPath,
	resolveTextContentPointSource,
	type ProjectConfigGateway,
} from "@nseng-ai/sdk/project-config/points";

import { OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID } from "./pr-title.ts";

export interface ObjectiveAutorunPrTitleTemplateSource {
	type: "env" | "ns.toml" | "conventional" | "default";
	label: string;
}

export type ObjectiveAutorunPrTitleTemplateRefusalCode =
	| "template-source-missing"
	| "template-source-unreadable"
	| "template-source-empty";

export type ResolveObjectiveAutorunPrTitleTemplateResult =
	| { type: "resolved"; template: string; source: ObjectiveAutorunPrTitleTemplateSource }
	| {
			type: "refused";
			code: ObjectiveAutorunPrTitleTemplateRefusalCode;
			message: string;
	  };

export interface ObjectiveAutorunPrTitleTemplateResolver {
	resolveTemplate(): Promise<ResolveObjectiveAutorunPrTitleTemplateResult>;
}

export type TemplateTextFileReader = (
	path: string,
) => Promise<{ ok: true; content: string } | { ok: false; message: string }>;

export interface CreateObjectiveAutorunPrTitleTemplateResolverOptions {
	repoRoot: string;
	descriptorSource: { descriptor: ExtensionDescriptor; descriptorUrl: string };
	env?: Record<string, string | undefined>;
	configGateway?: ProjectConfigGateway;
	readTextFile?: TemplateTextFileReader;
}

/**
 * Resolves the active `objective.autorun.pr-title` template content through the
 * shared point catalog with the Objectives descriptor preferred. Resolution is
 * fail-closed: a selected source that is missing, unreadable, or empty refuses
 * instead of falling through to a lower-precedence source.
 */
export function createObjectiveAutorunPrTitleTemplateResolver(
	options: CreateObjectiveAutorunPrTitleTemplateResolverOptions,
): ObjectiveAutorunPrTitleTemplateResolver {
	const configGateway = options.configGateway ?? nodeProjectConfigGateway;
	const readTextFile = options.readTextFile ?? nodeTemplateTextFileReader;
	return {
		resolveTemplate: async () => {
			const catalog = loadPointCatalog({
				repoRoot: options.repoRoot,
				gateway: configGateway,
				preferredDescriptors: [
					{
						descriptor: options.descriptorSource.descriptor,
						descriptorPath: fileURLToPath(options.descriptorSource.descriptorUrl),
					},
				],
				env: options.env ?? {},
			});
			const pointSource = resolveTextContentPointSource(
				catalog,
				OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID,
			);
			if (pointSource.type === "missing") {
				return {
					type: "refused",
					code: "template-source-missing",
					message: `Could not resolve ${OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID}: the point catalog has no installed text content or descriptor default.`,
				};
			}
			const resolvedPath =
				pointSource.type === "env"
					? {
							path: resolve(options.repoRoot, pointSource.path),
							label: `env ${pointSource.envVar} text-content ${pointSource.path}`,
						}
					: resolveTextContentPointPath(options.repoRoot, pointSource);
			if (resolvedPath === undefined) {
				return {
					type: "refused",
					code: "template-source-missing",
					message: `Could not resolve a text-content file path for ${OBJECTIVE_AUTORUN_PR_TITLE_POINT_ID}.`,
				};
			}
			const read = await readTextFile(resolvedPath.path);
			if (!read.ok) {
				return {
					type: "refused",
					code: "template-source-unreadable",
					message: `Could not read ${resolvedPath.label}: ${read.message}`,
				};
			}
			const template = read.content.replace(/\r?\n$/u, "");
			if (template.trim().length === 0) {
				return {
					type: "refused",
					code: "template-source-empty",
					message: `${resolvedPath.label} is empty.`,
				};
			}
			return {
				type: "resolved",
				template,
				source: { type: sourceType(pointSource.type), label: resolvedPath.label },
			};
		},
	};
}

async function nodeTemplateTextFileReader(path: string): ReturnType<TemplateTextFileReader> {
	try {
		return { ok: true, content: await readFile(path, "utf8") };
	} catch (error) {
		return { ok: false, message: formatErrorMessage(error) };
	}
}

function sourceType(
	type: "env" | "ns.toml" | "conventional" | "default",
): ObjectiveAutorunPrTitleTemplateSource["type"] {
	return type;
}
