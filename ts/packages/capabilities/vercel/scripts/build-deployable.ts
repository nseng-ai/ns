import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "@nseng-ai/foundation/exec";
import { build } from "esbuild";

import {
	compareApiFunctionDirectories,
	expectedApiFunctionDirectories,
	findHermeticApiFunctionProblems,
	findMissingRelativeModuleTargets,
	findMissingTriggerWorkflowManifestIds,
	findMissingWorkflowFunctionArtifacts,
	findWorkflowQueueTriggerProblems,
	findWorkflowSourcesMissingFromManifest,
	type HermeticApiFunctionPlan,
	mergeBuildOutputConfig,
	planHermeticApiFunction,
	REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS,
} from "../src/deployability/gate.ts";
import { triggerWorkflowIds } from "../src/trigger/workflow-ids.ts";

interface BuildPaths {
	readonly packageRoot: string;
	readonly apiSourceRoot: string;
	readonly functionsRoot: string;
	readonly apiFunctionsRoot: string;
	readonly configPath: string;
	readonly workflowV1Root: string;
	readonly workflowsSourceRoot: string;
}

interface CommandResult {
	readonly isSuccessful: boolean;
	readonly output: string;
}

interface ApiVerificationSummary {
	readonly bundleCount: number;
	readonly moduleCount: number;
}

interface WorkflowBuildState {
	readonly vercelBuildConfig: unknown;
}

interface WorkflowVerificationSummary {
	readonly sourceCount: number;
	readonly routeTriggeredIdCount: number;
	readonly workflowBuildConfig: unknown;
}

function resolveBuildPaths(): BuildPaths {
	const packageRoot = fileURLToPath(new URL("../", import.meta.url));
	const outputRoot = join(packageRoot, ".vercel/output");
	const functionsRoot = join(outputRoot, "functions");
	return {
		packageRoot,
		apiSourceRoot: join(packageRoot, "api"),
		functionsRoot,
		apiFunctionsRoot: join(functionsRoot, "api"),
		configPath: join(outputRoot, "config.json"),
		workflowV1Root: join(functionsRoot, ".well-known/workflow/v1"),
		workflowsSourceRoot: join(packageRoot, "workflows"),
	};
}

async function runTypeScriptGate(paths: BuildPaths): Promise<boolean> {
	return (await executeCommand("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], paths.packageRoot))
		.isSuccessful;
}

async function runVercelBuildAndDiagnostics(paths: BuildPaths): Promise<boolean> {
	const build = await executeCommand("vercel", ["build", "--prod"], paths.packageRoot);
	if (!build.isSuccessful) return false;
	if (/\berror TS\d+:/u.test(build.output)) {
		console.error("Vercel build emitted TypeScript diagnostics despite exiting successfully.");
		return false;
	}
	return true;
}

async function makeApiFunctionBundlesHermetic(paths: BuildPaths): Promise<boolean> {
	const entries = await readdir(paths.apiFunctionsRoot, { withFileTypes: true });
	const functionDirectories = entries
		.filter((entry) => entry.isDirectory() && entry.name.endsWith(".func"))
		.map((entry) => entry.name)
		.sort();
	for (const name of functionDirectories) {
		const functionRoot = join(paths.apiFunctionsRoot, name);
		const configPath = join(functionRoot, ".vc-config.json");
		let plan: HermeticApiFunctionPlan;
		try {
			plan = planHermeticApiFunction(await readJson(configPath));
		} catch (error) {
			console.error(`Cannot make API function api/${name} hermetic: ${String(error)}`);
			return false;
		}
		await build({
			entryPoints: [join(functionRoot, plan.sourceHandler)],
			outfile: join(functionRoot, plan.bundledHandler),
			bundle: true,
			platform: "node",
			format: "cjs",
			target: "node24",
			packages: "bundle",
			sourcemap: false,
			legalComments: "none",
			logLevel: "silent",
		});
		await writeFile(configPath, `${JSON.stringify(plan.config, null, 2)}\n`);
	}
	return true;
}

async function verifyApiFunctionBundles(
	paths: BuildPaths,
): Promise<ApiVerificationSummary | undefined> {
	const sourceEntries = await readdir(paths.apiSourceRoot, { withFileTypes: true });
	const sourceFileNames = sourceEntries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort();
	const expectedDirectories = expectedApiFunctionDirectories(sourceFileNames);

	const emittedEntries = await readdir(paths.apiFunctionsRoot, { withFileTypes: true });
	const emittedDirectories = emittedEntries
		.filter((entry) => entry.isDirectory() && entry.name.endsWith(".func"))
		.map((entry) => entry.name)
		.sort();
	const comparison = compareApiFunctionDirectories(expectedDirectories, emittedDirectories);
	for (const name of comparison.missing) {
		console.error(`Vercel build did not emit API function api/${name} required by api source.`);
	}
	for (const name of comparison.unexpected) {
		console.error(
			`Vercel build emitted API function api/${name} without an immediate api/*.ts source.`,
		);
	}
	if (comparison.missing.length > 0 || comparison.unexpected.length > 0) return undefined;

	let moduleCount = 0;
	for (const name of emittedDirectories) {
		const functionRoot = join(paths.apiFunctionsRoot, name);
		const emittedPaths = new Set(await walkFiles(functionRoot));
		const configProblems = findHermeticApiFunctionProblems(
			await readJson(join(functionRoot, ".vc-config.json")),
			emittedPaths,
		);
		if (configProblems.length > 0) {
			for (const problem of configProblems) {
				console.error(`Vercel function artifact api/${name} is not hermetic: ${problem}`);
			}
			return undefined;
		}
		const modules = await readJavaScriptModules(functionRoot);
		moduleCount += modules.size;
		const missing = findMissingRelativeModuleTargets(modules);
		if (missing.length === 0) continue;
		for (const item of missing) {
			console.error(
				`Vercel function artifact api/${name} is missing ${item.targetPath} imported by ${item.sourcePath}.`,
			);
		}
		return undefined;
	}
	return { bundleCount: emittedDirectories.length, moduleCount };
}

async function validateAndBuildWorkflows(
	paths: BuildPaths,
): Promise<WorkflowBuildState | undefined> {
	const validate = await executeCommand(
		"pnpm",
		["exec", "workflow", "validate", "--strict"],
		paths.packageRoot,
	);
	if (!validate.isSuccessful) {
		console.error("Workflow validation reported issues; the workflow sources are not deployable.");
		return undefined;
	}

	const vercelBuildConfig = await readJson(paths.configPath);
	const workflowBuild = await executeCommand(
		"pnpm",
		["exec", "workflow", "build", "--target", "vercel-build-output-api"],
		paths.packageRoot,
	);
	if (!workflowBuild.isSuccessful) {
		console.error('Workflow build failed; `"use workflow"` packaging is broken.');
		return undefined;
	}
	return { vercelBuildConfig };
}

async function verifyWorkflowManifestQueueAndSources(
	paths: BuildPaths,
): Promise<WorkflowVerificationSummary | undefined> {
	const emittedFunctionPaths = new Set(await walkFiles(paths.functionsRoot));
	const missingArtifacts = findMissingWorkflowFunctionArtifacts(emittedFunctionPaths);
	if (missingArtifacts.length > 0) {
		for (const artifact of missingArtifacts) {
			console.error(`Workflow build did not emit required function artifact ${artifact}.`);
		}
		return undefined;
	}

	const triggerProblems = findWorkflowQueueTriggerProblems(
		await readWorkflowJson(paths, "flow.func/.vc-config.json"),
	);
	if (triggerProblems.length > 0) {
		for (const problem of triggerProblems) console.error(`Queues wiring problem: ${problem}`);
		return undefined;
	}

	const workflowSources = await readWorkflowSources(paths);
	if (workflowSources.size === 0) {
		console.error(
			"No workflow sources found under workflows/; the packaging gate needs at least one.",
		);
		return undefined;
	}
	const manifest = await readWorkflowJson(paths, "manifest.json");
	const missingFromManifest = findWorkflowSourcesMissingFromManifest(workflowSources, manifest);
	if (missingFromManifest.length > 0) {
		for (const path of missingFromManifest) {
			console.error(`Workflow manifest has no workflow for ${path}; discovery silently failed.`);
		}
		return undefined;
	}

	const requiredIds = Object.values(triggerWorkflowIds);
	const missingWorkflowIds = findMissingTriggerWorkflowManifestIds(manifest);
	if (missingWorkflowIds.length > 0) {
		for (const id of missingWorkflowIds) {
			console.error(
				`Workflow manifest does not contain ${id}, which a route starts by metadata id.`,
			);
		}
		return undefined;
	}

	return {
		sourceCount: workflowSources.size,
		routeTriggeredIdCount: requiredIds.length,
		workflowBuildConfig: await readJson(paths.configPath),
	};
}

async function mergeAndWriteBuildOutputConfig(
	paths: BuildPaths,
	vercelBuildConfig: unknown,
	workflowBuildConfig: unknown,
): Promise<void> {
	const mergedConfig = mergeBuildOutputConfig(vercelBuildConfig, workflowBuildConfig);
	await writeFile(paths.configPath, `${JSON.stringify(mergedConfig, null, 2)}\n`);
}

function printFinalSummary(
	api: ApiVerificationSummary,
	workflow: WorkflowVerificationSummary,
): void {
	console.log(
		`Verified ${api.moduleCount} emitted modules and their relative imports across ` +
			`${api.bundleCount} source-derived API function bundles.`,
	);
	console.log(
		`Verified workflow packaging: ${workflow.sourceCount} workflow source(s), ` +
			`${REQUIRED_WORKFLOW_FUNCTION_ARTIFACTS.length} required function artifacts, Queues wiring, ` +
			`${workflow.routeTriggeredIdCount} route-triggered workflow id(s) in the manifest, ` +
			"and merged Build Output routes. Deployability is predicted locally; live behavior is pending verification.",
	);
}

async function main(): Promise<boolean> {
	const paths = resolveBuildPaths();
	if (!(await runTypeScriptGate(paths))) return false;
	if (!(await runVercelBuildAndDiagnostics(paths))) return false;
	if (!(await makeApiFunctionBundlesHermetic(paths))) return false;
	const api = await verifyApiFunctionBundles(paths);
	if (api === undefined) return false;
	const workflowBuild = await validateAndBuildWorkflows(paths);
	if (workflowBuild === undefined) return false;
	const workflow = await verifyWorkflowManifestQueueAndSources(paths);
	if (workflow === undefined) return false;
	await mergeAndWriteBuildOutputConfig(
		paths,
		workflowBuild.vercelBuildConfig,
		workflow.workflowBuildConfig,
	);
	printFinalSummary(api, workflow);
	return true;
}

async function executeCommand(
	command: string,
	args: readonly string[],
	cwd: string,
): Promise<CommandResult> {
	const result = await runCommand(command, args, {
		cwd,
		env: process.env,
		onStdout: (text) => process.stdout.write(text),
		onStderr: (text) => process.stderr.write(text),
	});
	if (result.type === "spawn-failed") {
		console.error(`${command} failed to start: ${result.error}`);
	}
	return {
		isSuccessful: result.type === "exited" && result.code === 0,
		output: `${result.stdout}${result.stderr}`,
	};
}

async function readWorkflowSources(paths: BuildPaths): Promise<ReadonlyMap<string, string>> {
	const sources = new Map<string, string>();
	const entries = await readdir(paths.workflowsSourceRoot, { withFileTypes: true });
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
		sources.set(
			`workflows/${entry.name}`,
			await readFile(join(paths.workflowsSourceRoot, entry.name), "utf8"),
		);
	}
	return sources;
}

async function walkFiles(root: string): Promise<readonly string[]> {
	const files: string[] = [];
	await visit(root);
	return files;

	async function visit(directory: string): Promise<void> {
		const entries = await readdir(directory, { withFileTypes: true });
		for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) await visit(path);
			else if (entry.isFile()) files.push(relative(root, path).replaceAll("\\", "/"));
		}
	}
}

async function readJavaScriptModules(root: string): Promise<ReadonlyMap<string, string>> {
	const modules = new Map<string, string>();
	for (const path of await walkFiles(root)) {
		if (!path.endsWith(".js")) continue;
		modules.set(path, await readFile(join(root, path), "utf8"));
	}
	return modules;
}

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readWorkflowJson(paths: BuildPaths, path: string): Promise<unknown> {
	return await readJson(join(paths.workflowV1Root, path));
}

if (import.meta.main) {
	const succeeded = await main();
	if (!succeeded) process.exitCode = 1;
}
