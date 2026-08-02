// Prompt Point content acquisition: given a point catalog and a content-reader
// boundary, select the active prompt source, resolve where its content lives,
// read it once, classify the outcome, and compose one factual failure message.
// Source selection and catalog construction live in `./points.ts`; workflow
// policy (diagnostics fatality, fallback, normalization, LM execution) stays
// with consumers.
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import {
	resolvePromptPointSource,
	type ConventionalPromptPointSource,
	type DefaultPromptPointSource,
	type EnvPromptPointSource,
	type NsTomlPromptPointSource,
	type PointCatalog,
} from "./points.ts";

export type PromptPointContentReadResult =
	| { ok: true; content: string }
	| { ok: false; reason: "missing"; message?: string }
	| { ok: false; reason: "unreadable"; message: string };

export interface PromptPointContentReader {
	readTextFile: (path: string) => Promise<PromptPointContentReadResult>;
}

export type ResolvedPromptPointContentSource =
	| EnvPromptPointSource
	| NsTomlPromptPointSource
	| ConventionalPromptPointSource
	| DefaultPromptPointSource;

/** Resolved source facts shared by success and post-selection failures. */
export interface ResolvedPromptPointContent {
	source: ResolvedPromptPointContentSource;
	path: string;
	label: string;
}

export type ResolvePromptPointContentResult =
	| { ok: true; content: string; resolved: ResolvedPromptPointContent }
	| { ok: false; reason: "missing-source"; message: string }
	| {
			ok: false;
			reason: "missing-file" | "unreadable" | "empty";
			resolved: ResolvedPromptPointContent;
			message: string;
	  };

export const nodePromptPointContentReader: PromptPointContentReader = {
	async readTextFile(path) {
		try {
			return { ok: true, content: await readFile(path, "utf8") };
		} catch (error) {
			const message = formatErrorMessage(error);
			if (isNodeFileNotFound(error)) return { ok: false, reason: "missing", message };
			return { ok: false, reason: "unreadable", message };
		}
	},
};

export function resolvePromptPointPath(
	repoRoot: string,
	source: NsTomlPromptPointSource | ConventionalPromptPointSource | DefaultPromptPointSource,
): { path: string; label: string } {
	switch (source.type) {
		case "ns.toml":
			return { path: join(repoRoot, source.path), label: `ns.toml prompt ${source.path}` };
		case "conventional":
			return { path: join(repoRoot, source.path), label: source.path };
		case "default":
			return {
				path: join(dirname(source.manifestPath), source.path),
				label: `manifest default ${source.path}`,
			};
	}
}

export async function resolvePromptPointContent(request: {
	repoRoot: string;
	catalog: PointCatalog;
	pointId: string;
	reader: PromptPointContentReader;
}): Promise<ResolvePromptPointContentResult> {
	const source = resolvePromptPointSource(request.catalog, request.pointId);
	if (source.type === "missing") {
		return {
			ok: false,
			reason: "missing-source",
			message: `Prompt point ${request.pointId} has no installed prompt or descriptor default.`,
		};
	}

	let resolved: ResolvedPromptPointContent;
	if (source.type === "env") {
		resolved = {
			source,
			path: resolve(request.repoRoot, source.path),
			label: `env ${source.envVar}`,
		};
	} else {
		resolved = { source, ...resolvePromptPointPath(request.repoRoot, source) };
	}

	const readResult = await request.reader.readTextFile(resolved.path);
	if (!readResult.ok) {
		if (readResult.reason === "missing") {
			return {
				ok: false,
				reason: "missing-file",
				resolved,
				message:
					readResult.message === undefined
						? `Selected ${resolved.label} is missing at ${resolved.path}.`
						: `Selected ${resolved.label} is missing at ${resolved.path}: ${readResult.message}`,
			};
		}
		return {
			ok: false,
			reason: "unreadable",
			resolved,
			message: `Could not read selected ${resolved.label} at ${resolved.path}: ${readResult.message}`,
		};
	}
	if (readResult.content.trim() === "") {
		return {
			ok: false,
			reason: "empty",
			resolved,
			message: `Selected ${resolved.label} at ${resolved.path} is empty.`,
		};
	}
	return { ok: true, content: readResult.content, resolved };
}

function isNodeFileNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}
