import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { dispatchWorkflowId } from "../workflows/dispatch-id.ts";
import { helloWorkflowId } from "../workflows/hello.ts";
import { sandboxProbeWorkflowId } from "../workflows/sandbox-probe.ts";
import { supervisionProbeWorkflowId } from "../workflows/supervision-probe-id.ts";

export interface MissingRelativeModuleTarget {
	readonly sourcePath: string;
	readonly specifier: string;
	readonly targetPath: string;
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

/**
 * Function artifacts the Workflow builder must emit under
 * `.vercel/output/functions/` for the workflow spine to be routable. Paths are
 * relative to the functions directory.
 */
export const REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS: readonly string[] = [
	".well-known/workflow/v1/flow.func/index.js",
	".well-known/workflow/v1/flow.func/.vc-config.json",
	".well-known/workflow/v1/step.func/index.js",
	".well-known/workflow/v1/step.func/.vc-config.json",
	".well-known/workflow/v1/webhook/[token].func/index.js",
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

/**
 * The Queues wiring contract for the default (un-namespaced) Workflow build:
 * the flow function consumes `__wkf_workflow_*`, the step function consumes
 * `__wkf_step_*`, both over the `queue/v2beta` trigger type.
 */
export function findWorkflowQueueTriggerProblems(vcConfigs: {
	readonly flow: unknown;
	readonly step: unknown;
}): readonly string[] {
	const problems: string[] = [];
	const expectations = [
		{ name: "flow", value: vcConfigs.flow, topic: "__wkf_workflow_*" },
		{ name: "step", value: vcConfigs.step, topic: "__wkf_step_*" },
	];
	for (const { name, value, topic } of expectations) {
		const parsed = workflowVcConfigSchema.safeParse(value);
		if (!parsed.success) {
			problems.push(`${name} function .vc-config.json is not an object with optional triggers.`);
			continue;
		}
		const triggers = parsed.data.experimentalTriggers ?? [];
		const hasQueueTrigger = triggers.some(
			(trigger) => trigger.type === "queue/v2beta" && trigger.topic === topic,
		);
		if (!hasQueueTrigger) {
			problems.push(
				`${name} function .vc-config.json is missing the queue/v2beta trigger on topic ${topic}.`,
			);
		}
	}
	return problems;
}

const workflowManifestSchema = z.looseObject({
	workflows: z.record(z.string(), z.record(z.string(), z.unknown())),
});

const useWorkflowDirectivePattern = /^\s*["']use workflow["'];?\s*$/mu;

/**
 * Every source file that declares `"use workflow"` must surface at least one
 * workflow in the emitted manifest; the builder succeeds with zero workflows,
 * so discovery failures are silent without this check.
 */
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

/**
 * Workflow ids the deployable's routes reference by explicit metadata
 * (`start({ workflowId })` — the route bundles never receive the workflow
 * transform, so nothing checks these strings at compile time). Each must be
 * present in the emitted manifest or the deployed route would fail at
 * runtime.
 */
export const ROUTE_TRIGGERED_WORKFLOW_IDS: readonly string[] = [
	helloWorkflowId,
	sandboxProbeWorkflowId,
	supervisionProbeWorkflowId,
	dispatchWorkflowId,
];

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

/**
 * `workflow build --target vercel-build-output-api` overwrites the
 * `.vercel/output/config.json` that `vercel build` produced, dropping the API
 * function routes. Merge the two: workflow routes (the webhook rewrite) run
 * first, then the original vercel-build routes; every other vercel-build key
 * (for example `crons`) is preserved. The workflow config is parsed strictly
 * so any new key the Workflow SDK starts emitting fails the gate loudly
 * instead of being silently discarded.
 */
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

async function main(): Promise<boolean> {
	const packageRoot = fileURLToPath(new URL("../", import.meta.url));
	if (
		!(await runCommand("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], packageRoot)).isSuccessful
	) {
		return false;
	}

	const build = await runCommand("vercel", ["build", "--prod"], packageRoot);
	if (!build.isSuccessful) return false;
	if (/\berror TS\d+:/u.test(build.output)) {
		console.error("Vercel build emitted TypeScript diagnostics despite exiting successfully.");
		return false;
	}

	if (!(await verifyApiFunctionBundles())) return false;

	if (!(await verifyWorkflowPackaging(packageRoot))) return false;

	return true;
}

/**
 * API function directories the Node builder must emit for every deployable
 * route to be servable. A route source that silently fails to package is the
 * proven escape-local-validation failure class, so the required list is
 * explicit rather than derived from `api/`.
 */
const REQUIRED_API_FUNCTION_DIRECTORIES: readonly string[] = [
	"health.func",
	"mint.func",
	"runs.func",
	"trigger.func",
];

/**
 * Verify every emitted `api/*.func` bundle: each required route function must
 * exist, and each emitted bundle's relative-import graph must be closed (the
 * unbundled Node-builder emit omitted package sources on the first
 * deployment, so closure is checked per function).
 */
async function verifyApiFunctionBundles(): Promise<boolean> {
	const apiFunctionsRoot = fileURLToPath(
		new URL("../.vercel/output/functions/api/", import.meta.url),
	);
	const entries = await readdir(apiFunctionsRoot, { withFileTypes: true });
	const emittedDirectories = entries
		.filter((entry) => entry.isDirectory() && entry.name.endsWith(".func"))
		.map((entry) => entry.name)
		.sort();

	const missingDirectories = REQUIRED_API_FUNCTION_DIRECTORIES.filter(
		(name) => !emittedDirectories.includes(name),
	);
	if (missingDirectories.length > 0) {
		for (const name of missingDirectories) {
			console.error(`Vercel build did not emit required API function api/${name}.`);
		}
		return false;
	}

	let moduleCount = 0;
	for (const name of emittedDirectories) {
		const modules = await readJavaScriptModules(join(apiFunctionsRoot, name));
		moduleCount += modules.size;
		const missing = findMissingRelativeModuleTargets(modules);
		if (missing.length > 0) {
			for (const item of missing) {
				console.error(
					`Vercel function artifact api/${name} is missing ${item.targetPath} imported by ${item.sourcePath}.`,
				);
			}
			return false;
		}
	}
	console.log(
		`Verified ${moduleCount} emitted modules and their relative imports across ` +
			`${emittedDirectories.length} API function bundles.`,
	);
	return true;
}

/**
 * Local deployability gate for `"use workflow"` / `"use step"` packaging: run
 * the Workflow SDK's serde validation and Build Output API builder offline,
 * then verify the emitted function bundles, their Queues wiring, workflow
 * discovery, and the merged Build Output routing config. This predicts
 * deployability only — no live workflow behavior is verified here.
 */
async function verifyWorkflowPackaging(packageRoot: string): Promise<boolean> {
	const validate = await runCommand(
		"pnpm",
		["exec", "workflow", "validate", "--strict"],
		packageRoot,
	);
	if (!validate.isSuccessful) {
		console.error("Workflow validation reported issues; the workflow sources are not deployable.");
		return false;
	}

	// `workflow build` overwrites `.vercel/output/config.json`; capture the
	// vercel-build config first so the two can be merged afterwards.
	const outputRoot = join(packageRoot, ".vercel/output");
	const configPath = join(outputRoot, "config.json");
	const vercelBuildConfig: unknown = JSON.parse(await readFile(configPath, "utf8"));

	const workflowBuild = await runCommand(
		"pnpm",
		["exec", "workflow", "build", "--target", "vercel-build-output-api"],
		packageRoot,
	);
	if (!workflowBuild.isSuccessful) {
		console.error('Workflow build failed; `"use workflow"` packaging is broken.');
		return false;
	}

	const functionsRoot = join(outputRoot, "functions");
	const emittedFunctionPaths = await listFilesRecursively(functionsRoot);
	const missingArtifacts = findMissingWorkflowFunctionArtifacts(emittedFunctionPaths);
	if (missingArtifacts.length > 0) {
		for (const artifact of missingArtifacts) {
			console.error(`Workflow build did not emit required function artifact ${artifact}.`);
		}
		return false;
	}

	const workflowV1Root = join(functionsRoot, ".well-known/workflow/v1");
	const readWorkflowJson = async (path: string): Promise<unknown> =>
		JSON.parse(await readFile(join(workflowV1Root, path), "utf8")) as unknown;

	const triggerProblems = findWorkflowQueueTriggerProblems({
		flow: await readWorkflowJson("flow.func/.vc-config.json"),
		step: await readWorkflowJson("step.func/.vc-config.json"),
	});
	if (triggerProblems.length > 0) {
		for (const problem of triggerProblems) console.error(`Queues wiring problem: ${problem}`);
		return false;
	}

	const workflowSources = await readWorkflowSources(packageRoot);
	if (workflowSources.size === 0) {
		console.error(
			"No workflow sources found under workflows/; the packaging gate needs at least one.",
		);
		return false;
	}
	const manifest = await readWorkflowJson("manifest.json");
	const missingFromManifest = findWorkflowSourcesMissingFromManifest(workflowSources, manifest);
	if (missingFromManifest.length > 0) {
		for (const path of missingFromManifest) {
			console.error(`Workflow manifest has no workflow for ${path}; discovery silently failed.`);
		}
		return false;
	}

	const missingWorkflowIds = findMissingWorkflowManifestIds(manifest, ROUTE_TRIGGERED_WORKFLOW_IDS);
	if (missingWorkflowIds.length > 0) {
		for (const id of missingWorkflowIds) {
			console.error(
				`Workflow manifest does not contain ${id}, which a route starts by metadata id.`,
			);
		}
		return false;
	}

	// No relative-import closure scan here: unlike the unbundled @vercel/node
	// emit, the workflow functions are esbuild bundles, so unresolved imports
	// already fail `workflow build` itself.
	const workflowBuildConfig: unknown = JSON.parse(await readFile(configPath, "utf8"));
	const mergedConfig = mergeBuildOutputConfig(vercelBuildConfig, workflowBuildConfig);
	await writeFile(configPath, `${JSON.stringify(mergedConfig, null, 2)}\n`);

	console.log(
		`Verified workflow packaging: ${workflowSources.size} workflow source(s), ` +
			`${REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS.length} required function artifacts, Queues wiring, ` +
			`${ROUTE_TRIGGERED_WORKFLOW_IDS.length} route-triggered workflow id(s) in the manifest, ` +
			"and merged Build Output routes. Deployability is predicted locally; live behavior is pending verification.",
	);
	return true;
}

async function readWorkflowSources(packageRoot: string): Promise<ReadonlyMap<string, string>> {
	const workflowsRoot = join(packageRoot, "workflows");
	const sources = new Map<string, string>();
	const entries = await readdir(workflowsRoot, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
		sources.set(
			posix.join("workflows", entry.name),
			await readFile(join(workflowsRoot, entry.name), "utf8"),
		);
	}
	return sources;
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

async function listFilesRecursively(root: string): Promise<ReadonlySet<string>> {
	const files = new Set<string>();
	await visit(root);
	return files;

	async function visit(directory: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const path = `${directory}/${entry.name}`;
			if (entry.isDirectory()) {
				await visit(path);
			} else if (entry.isFile()) {
				files.add(relative(root, path).replaceAll("\\", "/"));
			}
		}
	}
}

async function readJavaScriptModules(root: string): Promise<ReadonlyMap<string, string>> {
	const modules = new Map<string, string>();
	await visit(root);
	return modules;

	async function visit(directory: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries) {
			const path = `${directory}/${entry.name}`;
			if (entry.isDirectory()) {
				await visit(path);
			} else if (entry.isFile() && entry.name.endsWith(".js")) {
				modules.set(relative(root, path).replaceAll("\\", "/"), await readFile(path, "utf8"));
			}
		}
	}
}

async function runCommand(
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<{ readonly isSuccessful: boolean; readonly output: string }> {
	return new Promise((resolve) => {
		const child = spawn(command, [...args], {
			cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			output += text;
			process.stdout.write(text);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			output += text;
			process.stderr.write(text);
		});
		child.on("error", (error) => {
			console.error(`${command} failed to start: ${error.message}`);
			resolve({ isSuccessful: false, output });
		});
		child.on("close", (code) => resolve({ isSuccessful: code === 0, output }));
	});
}

if (import.meta.main) {
	const succeeded = await main();
	if (!succeeded) process.exitCode = 1;
}
