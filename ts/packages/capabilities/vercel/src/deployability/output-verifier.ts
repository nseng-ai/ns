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
	findNonVercelWorkflowHostModules,
	findWorkflowQueueTriggerProblems,
	findWorkflowSourcesMissingFromManifest,
	findWorkflowTargetWorldProblems,
	REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS,
} from "./gate.ts";
import { triggerWorkflowIds } from "../trigger/workflow-ids.ts";

export interface BuildOutputVerificationOptions {
	readonly outputRoot: string;
	readonly apiSourceRoot: string;
	readonly workflowsSourceRoot: string;
}

export interface BuildOutputVerificationOperations {
	walkFiles(root: string): Promise<readonly string[]>;
	listImmediateTypeScriptFiles(root: string): Promise<readonly string[]>;
	listImmediateFunctionDirectories(root: string): Promise<readonly string[]>;
	readText(path: string): Promise<string>;
	readBinary(path: string): Promise<Uint8Array>;
}

export type BuildOutputVerificationResult =
	| {
			readonly ok: true;
			readonly digest: string;
			readonly fileCount: number;
			readonly apiFunctionCount: number;
			readonly javaScriptModuleCount: number;
			readonly workflowSourceCount: number;
			readonly requiredWorkflowArtifactCount: number;
			readonly routeTriggeredWorkflowIdCount: number;
	  }
	| { readonly ok: false; readonly problems: readonly string[] };

const realOperations: BuildOutputVerificationOperations = {
	walkFiles,
	async listImmediateTypeScriptFiles(root) {
		return (await readdir(root, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
			.map((entry) => entry.name)
			.sort();
	},
	async listImmediateFunctionDirectories(root) {
		return (await readdir(root, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory() && entry.name.endsWith(".func"))
			.map((entry) => entry.name)
			.sort();
	},
	async readText(path) {
		return await readFile(path, "utf8");
	},
	async readBinary(path) {
		return await readFile(path);
	},
};

/** The single authoritative verifier used before and after every output promotion. */
export async function verifyDispatchBuildOutput(
	options: BuildOutputVerificationOptions,
	operations: BuildOutputVerificationOperations = realOperations,
): Promise<BuildOutputVerificationResult> {
	try {
		return await verifyDispatchBuildOutputInternal(options, operations);
	} catch (error) {
		return {
			ok: false,
			problems: [`Cannot verify Build Output: ${safeErrorMessage(error)}`],
		};
	}
}

async function verifyDispatchBuildOutputInternal(
	options: BuildOutputVerificationOptions,
	operations: BuildOutputVerificationOperations,
): Promise<BuildOutputVerificationResult> {
	const { outputRoot, apiSourceRoot, workflowsSourceRoot } = options;
	const problems: string[] = [];
	const outputFiles = await operations.walkFiles(outputRoot);
	const functionsRoot = join(outputRoot, "functions");
	const apiFunctionsRoot = join(functionsRoot, "api");
	const sourceNames = await readList(
		"API sources",
		() => operations.listImmediateTypeScriptFiles(apiSourceRoot),
		problems,
	);
	const emittedDirectories = await readList(
		"API function output",
		() => operations.listImmediateFunctionDirectories(apiFunctionsRoot),
		problems,
	);
	const comparison = compareApiFunctionDirectories(
		expectedApiFunctionDirectories(sourceNames),
		emittedDirectories,
	);
	for (const name of comparison.missing) problems.push(`Missing API function api/${name}.`);
	for (const name of comparison.unexpected) problems.push(`Unexpected API function api/${name}.`);

	let javaScriptModuleCount = 0;
	for (const name of emittedDirectories) {
		const functionRoot = join(apiFunctionsRoot, name);
		const paths = new Set(await operations.walkFiles(functionRoot));
		const config = await readJson(join(functionRoot, ".vc-config.json"), operations, problems);
		for (const problem of findHermeticApiFunctionProblems(config, paths)) {
			problems.push(`API function api/${name}: ${problem}`);
		}
		const modules = new Map<string, string>();
		for (const path of paths) {
			if (!path.endsWith(".js") && !path.endsWith(".cjs") && !path.endsWith(".mjs")) continue;
			modules.set(
				path,
				await readText(
					`API function api/${name} module ${path}`,
					join(functionRoot, path),
					operations,
				),
			);
		}
		javaScriptModuleCount += modules.size;
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
	const workflowHostModules = new Map<string, string>();
	for (const path of ["flow.func/index.mjs", "webhook/[token].func/index.mjs"]) {
		try {
			workflowHostModules.set(
				path,
				await readText(`Workflow host ${path}`, join(workflowRoot, path), operations),
			);
		} catch (error) {
			problems.push(safeErrorMessage(error));
		}
	}
	for (const path of findNonVercelWorkflowHostModules(workflowHostModules)) {
		problems.push(`Workflow host ${path} is not statically bound to the Vercel world.`);
	}
	const manifest = await readJson(join(workflowRoot, "manifest.json"), operations, problems);
	const flowConfig = await readJson(
		join(workflowRoot, "flow.func/.vc-config.json"),
		operations,
		problems,
	);
	for (const problem of findWorkflowQueueTriggerProblems(flowConfig)) problems.push(problem);

	const workflowSources = await readWorkflowSources(workflowsSourceRoot, operations, problems);
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
		digest: await digestInventory(outputRoot, outputFiles, operations),
		fileCount: outputFiles.length,
		apiFunctionCount: emittedDirectories.length,
		javaScriptModuleCount,
		workflowSourceCount: workflowSources.size,
		requiredWorkflowArtifactCount: REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS.length,
		routeTriggeredWorkflowIdCount: Object.values(triggerWorkflowIds).length,
	};
}

/**
 * Write-only problem sink. Helpers record problems and never read, reorder, or
 * remove them; the verifier owns the backing array and is its only reader.
 */
interface ProblemSink {
	push(problem: string): void;
}

async function readList(
	context: string,
	read: () => Promise<readonly string[]>,
	problems: ProblemSink,
): Promise<readonly string[]> {
	try {
		return await read();
	} catch (error) {
		problems.push(`Cannot read ${context}: ${safeErrorMessage(error)}`);
		return [];
	}
}

async function readWorkflowSources(
	root: string,
	operations: BuildOutputVerificationOperations,
	problems: ProblemSink,
): Promise<ReadonlyMap<string, string>> {
	const sources = new Map<string, string>();
	const names = await readList(
		"Workflow sources",
		() => operations.listImmediateTypeScriptFiles(root),
		problems,
	);
	for (const name of names) {
		try {
			sources.set(
				`workflows/${name}`,
				await readText(`Workflow source workflows/${name}`, join(root, name), operations),
			);
		} catch (error) {
			problems.push(safeErrorMessage(error));
		}
	}
	return sources;
}

async function readJson(
	path: string,
	operations: BuildOutputVerificationOperations,
	problems: ProblemSink,
): Promise<unknown> {
	try {
		return JSON.parse(await readText(`JSON file ${path}`, path, operations)) as unknown;
	} catch (error) {
		problems.push(`Cannot parse ${path}: ${safeErrorMessage(error)}`);
		return null;
	}
}

async function readText(
	context: string,
	path: string,
	operations: BuildOutputVerificationOperations,
): Promise<string> {
	try {
		return await operations.readText(path);
	} catch (error) {
		throw new Error(`Cannot read ${context}: ${safeErrorMessage(error)}`);
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

async function digestInventory(
	root: string,
	files: readonly string[],
	operations: BuildOutputVerificationOperations,
): Promise<string> {
	const hash = createHash("sha256");
	for (const path of files) {
		let content: Uint8Array;
		try {
			content = await operations.readBinary(join(root, path));
		} catch (error) {
			throw new Error(`Cannot read digest input ${path}: ${safeErrorMessage(error)}`);
		}
		hash.update(`${path}\0${content.byteLength}\0`);
		hash.update(content);
	}
	return `sha256:${hash.digest("hex")}`;
}

function safeErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : "unknown error";
	return message.length <= 500 ? message : `${message.slice(0, 499)}…`;
}
