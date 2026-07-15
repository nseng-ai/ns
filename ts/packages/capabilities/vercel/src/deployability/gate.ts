import { posix } from "node:path";

import { z } from "zod";

import { triggerWorkflowIds } from "../trigger/workflow-ids.ts";

export interface MissingRelativeModuleTarget {
	readonly sourcePath: string;
	readonly specifier: string;
	readonly targetPath: string;
}

export interface ApiFunctionDirectoryComparison {
	readonly missing: readonly string[];
	readonly unexpected: readonly string[];
}

export interface HermeticApiFunctionPlan {
	readonly sourceHandler: string;
	readonly bundledHandler: string;
	readonly config: Readonly<Record<string, unknown>>;
}

const apiFunctionConfigSchema = z.looseObject({
	handler: z.string(),
	runtime: z.string(),
});

export function planHermeticApiFunction(config: unknown): HermeticApiFunctionPlan {
	const parsed = apiFunctionConfigSchema.safeParse(config);
	if (!parsed.success) {
		throw new Error("Vercel emitted an API function config without a handler and runtime.");
	}
	if (!parsed.data.handler.endsWith(".js")) {
		throw new Error("Vercel emitted an API function config without a JavaScript handler.");
	}
	const bundledHandler = `${parsed.data.handler.slice(0, -3)}.cjs`;
	const hermeticConfig: Record<string, unknown> = {
		...parsed.data,
		handler: bundledHandler,
		shouldAddSourcemapSupport: false,
	};
	delete hermeticConfig.filePathMap;
	return {
		sourceHandler: parsed.data.handler,
		bundledHandler,
		config: hermeticConfig,
	};
}

export function findHermeticApiFunctionProblems(
	config: unknown,
	emittedPaths: ReadonlySet<string>,
): readonly string[] {
	const parsed = apiFunctionConfigSchema.safeParse(config);
	if (!parsed.success) return ["API function config has no handler and runtime."];
	const problems: string[] = [];
	if (!parsed.data.handler.endsWith(".cjs")) {
		problems.push("API function handler is not a CommonJS bundle.");
	}
	if (Object.hasOwn(parsed.data, "filePathMap")) {
		problems.push("API function config still depends on filePathMap.");
	}
	if (!emittedPaths.has(parsed.data.handler)) {
		problems.push(`API function bundle is missing handler ${parsed.data.handler}.`);
	}
	return problems;
}

export function expectedApiFunctionDirectories(
	apiSourceFileNames: readonly string[],
): readonly string[] {
	return apiSourceFileNames
		.filter((name) => name.endsWith(".ts"))
		.map((name) => `${name.slice(0, -3)}.func`)
		.sort();
}

export function compareApiFunctionDirectories(
	expected: readonly string[],
	emitted: readonly string[],
): ApiFunctionDirectoryComparison {
	const expectedSet = new Set(expected);
	const emittedSet = new Set(emitted);
	return {
		missing: expected.filter((name) => !emittedSet.has(name)),
		unexpected: emitted.filter((name) => !expectedSet.has(name)),
	};
}

export function findMissingRelativeModuleTargets(
	modules: ReadonlyMap<string, string>,
): readonly MissingRelativeModuleTarget[] {
	const missing: MissingRelativeModuleTarget[] = [];
	for (const [sourcePath, source] of modules) {
		for (const specifier of relativeModuleSpecifiers(source)) {
			const targetPath = posix.resolve("/", posix.dirname(sourcePath), specifier).slice(1);
			if (!modules.has(targetPath)) missing.push({ sourcePath, specifier, targetPath });
		}
	}
	return missing;
}

/** Function artifacts the Workflow v5 builder must emit under `.vercel/output/functions/`. */
export const REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS: readonly string[] = [
	".well-known/workflow/v1/flow.func/index.mjs",
	".well-known/workflow/v1/flow.func/.vc-config.json",
	".well-known/workflow/v1/webhook/[token].func/index.mjs",
	".well-known/workflow/v1/webhook/[token].func/.vc-config.json",
	".well-known/workflow/v1/manifest.json",
];

export function findMissingWorkflowFunctionArtifacts(
	emittedFunctionPaths: ReadonlySet<string>,
): readonly string[] {
	return REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS.filter((path) => !emittedFunctionPaths.has(path));
}

const queueTriggerSchema = z.looseObject({
	type: z.string(),
	topic: z.string(),
});

const workflowVcConfigSchema = z.looseObject({
	experimentalTriggers: z.array(queueTriggerSchema).optional(),
});

export function findWorkflowQueueTriggerProblems(flowVcConfig: unknown): readonly string[] {
	const parsed = workflowVcConfigSchema.safeParse(flowVcConfig);
	if (!parsed.success) {
		return ["flow function .vc-config.json is not an object with optional triggers."];
	}
	const hasWorkflowTrigger = (parsed.data.experimentalTriggers ?? []).some(
		(trigger) => trigger.type === "queue/v2beta" && trigger.topic === "__wkf_workflow_*",
	);
	return hasWorkflowTrigger
		? []
		: [
				"flow function .vc-config.json is missing the queue/v2beta trigger on topic __wkf_workflow_*.",
			];
}

const workflowManifestSchema = z.looseObject({
	workflows: z.record(z.string(), z.record(z.string(), z.unknown())),
});

const useWorkflowDirectivePattern = /^\s*["']use workflow["'];?\s*$/mu;

export function findWorkflowSourcesMissingFromManifest(
	workflowSources: ReadonlyMap<string, string>,
	manifest: unknown,
): readonly string[] {
	const parsed = workflowManifestSchema.safeParse(manifest);
	if (!parsed.success) {
		return [...workflowSources.keys()].filter((path) =>
			useWorkflowDirectivePattern.test(workflowSources.get(path) ?? ""),
		);
	}
	const missing: string[] = [];
	for (const [path, source] of workflowSources) {
		if (!useWorkflowDirectivePattern.test(source)) continue;
		const entries = parsed.data.workflows[path];
		if (entries === undefined || Object.keys(entries).length === 0) missing.push(path);
	}
	return missing;
}

const workflowManifestEntrySchema = z.looseObject({
	workflowId: z.string().optional(),
});

export function findMissingTriggerWorkflowManifestIds(manifest: unknown): readonly string[] {
	return findMissingWorkflowManifestIds(manifest, Object.values(triggerWorkflowIds));
}

export function findMissingWorkflowManifestIds(
	manifest: unknown,
	requiredIds: readonly string[],
): readonly string[] {
	const parsed = workflowManifestSchema.safeParse(manifest);
	if (!parsed.success) return [...requiredIds];
	const emittedIds = new Set<string>();
	for (const entries of Object.values(parsed.data.workflows)) {
		for (const entry of Object.values(entries)) {
			const entryResult = workflowManifestEntrySchema.safeParse(entry);
			if (entryResult.success && entryResult.data.workflowId !== undefined) {
				emittedIds.add(entryResult.data.workflowId);
			}
		}
	}
	return requiredIds.filter((id) => !emittedIds.has(id));
}

const buildOutputConfigSchema = z.looseObject({
	version: z.number(),
	routes: z.array(z.unknown()).optional(),
});

const workflowBuildOutputConfigSchema = z.strictObject({
	version: z.number(),
	routes: z.array(z.unknown()).optional(),
});

export function mergeBuildOutputConfig(
	vercelConfig: unknown,
	workflowConfig: unknown,
): Record<string, unknown> {
	const vercelParsed = buildOutputConfigSchema.safeParse(vercelConfig);
	if (!vercelParsed.success) {
		throw new Error("vercel build emitted a config.json without a numeric version.");
	}
	const workflowParsed = workflowBuildOutputConfigSchema.safeParse(workflowConfig);
	if (!workflowParsed.success) {
		throw new Error(
			"workflow build emitted a config.json with keys beyond version/routes; " +
				"the merge in scripts/build-deployable.ts must learn about them before they can deploy.",
		);
	}
	if (vercelParsed.data.version !== workflowParsed.data.version) {
		throw new Error(
			`Build Output config versions disagree: vercel build emitted ${vercelParsed.data.version}, ` +
				`workflow build emitted ${workflowParsed.data.version}.`,
		);
	}
	return {
		...vercelParsed.data,
		routes: [...(workflowParsed.data.routes ?? []), ...(vercelParsed.data.routes ?? [])],
	};
}

function relativeModuleSpecifiers(source: string): readonly string[] {
	const specifiers: string[] = [];
	const pattern = /\b(?:from|import)\s*(?:\(\s*)?["'](\.[^"']+)["']/gu;
	for (const match of source.matchAll(pattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push(specifier);
	}
	return specifiers;
}
