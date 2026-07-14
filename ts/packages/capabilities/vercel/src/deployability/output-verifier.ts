import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import {
	compareApiFunctionDirectories,
	expectedApiFunctionDirectories,
	findDispatchStepInventoryProblems,
	findHermeticApiFunctionProblems,
	findMissingRelativeModuleTargets,
	findMissingTriggerWorkflowManifestIds,
	findMissingWorkflowFunctionArtifacts,
	findWorkflowQueueTriggerProblems,
	findWorkflowSourcesMissingFromManifest,
	findWorkflowTargetWorldProblems,
} from "./gate.ts";

export interface BuildOutputVerificationOptions {
	readonly outputRoot: string;
	readonly apiSourceRoot: string;
	readonly workflowsSourceRoot: string;
}

export type BuildOutputVerificationResult =
	| {
			readonly ok: true;
			readonly digest: string;
			readonly fileCount: number;
			readonly apiFunctionCount: number;
			readonly workflowSourceCount: number;
	  }
	| { readonly ok: false; readonly problems: readonly string[] };

/** The single authoritative verifier used before and after every output promotion. */
export async function verifyDispatchBuildOutput(
	options: BuildOutputVerificationOptions,
): Promise<BuildOutputVerificationResult> {
	const { outputRoot, apiSourceRoot, workflowsSourceRoot } = options;
	const problems: string[] = [];
	let outputFiles: readonly string[];
	try {
		outputFiles = await walkFiles(outputRoot);
	} catch (error) {
		return { ok: false, problems: [`Cannot read Build Output: ${safeErrorMessage(error)}`] };
	}
	const functionsRoot = join(outputRoot, "functions");
	const apiFunctionsRoot = join(functionsRoot, "api");
	const sourceNames = await immediateTypeScriptFiles(apiSourceRoot, problems);
	const emittedDirectories = await immediateFunctionDirectories(apiFunctionsRoot, problems);
	const comparison = compareApiFunctionDirectories(
		expectedApiFunctionDirectories(sourceNames),
		emittedDirectories,
	);
	for (const name of comparison.missing) problems.push(`Missing API function api/${name}.`);
	for (const name of comparison.unexpected) problems.push(`Unexpected API function api/${name}.`);

	for (const name of emittedDirectories) {
		const functionRoot = join(apiFunctionsRoot, name);
		const paths = new Set(await walkFiles(functionRoot));
		const config = await readJson(join(functionRoot, ".vc-config.json"), problems);
		for (const problem of findHermeticApiFunctionProblems(config, paths)) {
			problems.push(`API function api/${name}: ${problem}`);
		}
		const modules = new Map<string, string>();
		for (const path of paths) {
			if (path.endsWith(".js") || path.endsWith(".cjs") || path.endsWith(".mjs")) {
				modules.set(path, await readFile(join(functionRoot, path), "utf8"));
			}
		}
		for (const missing of findMissingRelativeModuleTargets(modules)) {
			problems.push(`${name}/${missing.sourcePath} imports missing ${missing.targetPath}.`);
		}
		for (const path of findWorkflowTargetWorldProblems(modules)) {
			problems.push(`${name}/${path} contains Workflow's uninjected target-world fallback.`);
		}
	}

	const emittedFunctionPaths = new Set(
		outputFiles
			.filter((path) => path.startsWith("functions/"))
			.map((path) => path.slice("functions/".length)),
	);
	for (const path of findMissingWorkflowFunctionArtifacts(emittedFunctionPaths)) {
		problems.push(`Missing Workflow artifact ${path}.`);
	}
	const workflowRoot = join(functionsRoot, ".well-known/workflow/v1");
	const manifest = await readJson(join(workflowRoot, "manifest.json"), problems);
	const flowConfig = await readJson(join(workflowRoot, "flow.func/.vc-config.json"), problems);
	for (const problem of findWorkflowQueueTriggerProblems(flowConfig)) problems.push(problem);

	const workflowSources = await readWorkflowSources(workflowsSourceRoot, problems);
	for (const path of findWorkflowSourcesMissingFromManifest(workflowSources, manifest)) {
		problems.push(`Workflow source ${path} is absent from the manifest.`);
	}
	for (const id of findMissingTriggerWorkflowManifestIds(manifest)) {
		problems.push(`Route-triggered Workflow id ${id} is absent from the manifest.`);
	}
	const inventory = findDispatchStepInventoryProblems(manifest);
	for (const name of inventory.missing) problems.push(`Current dispatch step ${name} is absent.`);
	for (const name of inventory.retired) problems.push(`Retired dispatch step ${name} is present.`);

	if (problems.length > 0) return { ok: false, problems };
	return {
		ok: true,
		digest: await digestInventory(outputRoot, outputFiles),
		fileCount: outputFiles.length,
		apiFunctionCount: emittedDirectories.length,
		workflowSourceCount: workflowSources.size,
	};
}

async function immediateTypeScriptFiles(
	root: string,
	problems: string[],
): Promise<readonly string[]> {
	try {
		return (await readdir(root, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
			.map((entry) => entry.name)
			.sort();
	} catch (error) {
		problems.push(`Cannot read API sources: ${safeErrorMessage(error)}`);
		return [];
	}
}

async function immediateFunctionDirectories(
	root: string,
	problems: string[],
): Promise<readonly string[]> {
	try {
		return (await readdir(root, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory() && entry.name.endsWith(".func"))
			.map((entry) => entry.name)
			.sort();
	} catch (error) {
		problems.push(`Cannot read API function output: ${safeErrorMessage(error)}`);
		return [];
	}
}

async function readWorkflowSources(
	root: string,
	problems: string[],
): Promise<ReadonlyMap<string, string>> {
	const sources = new Map<string, string>();
	try {
		for (const entry of (await readdir(root, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			if (entry.isFile() && entry.name.endsWith(".ts")) {
				sources.set(`workflows/${entry.name}`, await readFile(join(root, entry.name), "utf8"));
			}
		}
	} catch (error) {
		problems.push(`Cannot read Workflow sources: ${safeErrorMessage(error)}`);
	}
	return sources;
}

async function readJson(path: string, problems: string[]): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8")) as unknown;
	} catch (error) {
		problems.push(`Cannot parse ${path}: ${safeErrorMessage(error)}`);
		return null;
	}
}

async function walkFiles(root: string): Promise<readonly string[]> {
	const files: string[] = [];
	await visit(root);
	return files;
	async function visit(directory: string): Promise<void> {
		for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
			else throw new Error(`Build Output contains unsupported path ${path}.`);
		}
	}
}

async function digestInventory(root: string, files: readonly string[]): Promise<string> {
	const hash = createHash("sha256");
	for (const path of files) {
		const content = await readFile(join(root, path));
		hash.update(`${path}\0${content.byteLength}\0`);
		hash.update(content);
	}
	return `sha256:${hash.digest("hex")}`;
}

function safeErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
}
