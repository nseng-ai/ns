import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "@nseng-ai/foundation/exec";
import { build } from "esbuild";

import {
	type HermeticApiFunctionPlan,
	mergeBuildOutputConfig,
	planHermeticApiFunction,
} from "../src/deployability/gate.ts";
import {
	type BuildOutputVerificationResult,
	verifyDispatchBuildOutput,
} from "../src/deployability/output-verifier.ts";

interface BuildPaths {
	readonly packageRoot: string;
	readonly outputRoot: string;
	readonly apiSourceRoot: string;
	readonly apiFunctionsRoot: string;
	readonly configPath: string;
	readonly workflowsSourceRoot: string;
}

interface CommandResult {
	readonly isSuccessful: boolean;
	readonly output: string;
}

interface WorkflowBuildState {
	readonly vercelBuildConfig: unknown;
	readonly workflowBuildConfig: unknown;
}

function resolveBuildPaths(): BuildPaths {
	const packageRoot = fileURLToPath(new URL("../", import.meta.url));
	const outputRoot = join(packageRoot, ".vercel/output");
	return {
		packageRoot,
		outputRoot,
		apiSourceRoot: join(packageRoot, "api"),
		apiFunctionsRoot: join(outputRoot, "functions/api"),
		configPath: join(outputRoot, "config.json"),
		workflowsSourceRoot: join(packageRoot, "workflows"),
	};
}

async function runTypeScriptGate(paths: BuildPaths): Promise<boolean> {
	return (await executeCommand("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], paths.packageRoot))
		.isSuccessful;
}

async function runVercelBuildAndDiagnostics(paths: BuildPaths): Promise<boolean> {
	const buildResult = await executeCommand("vercel", ["build", "--prod"], paths.packageRoot);
	if (!buildResult.isSuccessful) return false;
	if (/\berror TS\d+:/u.test(buildResult.output)) {
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
		const temporaryRoot = `${functionRoot}.ns-hermetic`;
		await rm(temporaryRoot, { recursive: true, force: true });
		try {
			await mkdir(join(temporaryRoot, ...plan.bundledHandler.split("/").slice(0, -1)), {
				recursive: true,
			});
			await build({
				entryPoints: [join(functionRoot, plan.sourceHandler)],
				outfile: join(temporaryRoot, plan.bundledHandler),
				bundle: true,
				alias: {
					"@workflow/core/runtime/world-target": "@workflow/world-vercel",
				},
				platform: "node",
				format: "cjs",
				target: "node24",
				packages: "bundle",
				sourcemap: false,
				legalComments: "none",
				logLevel: "silent",
				minifyWhitespace: true,
			});
			await writeFile(
				join(temporaryRoot, ".vc-config.json"),
				`${JSON.stringify(plan.config, null, 2)}\n`,
			);
			await rm(functionRoot, { recursive: true });
			await rename(temporaryRoot, functionRoot);
		} catch (error) {
			await rm(temporaryRoot, { recursive: true, force: true });
			console.error(`Cannot make API function api/${name} hermetic: ${String(error)}`);
			return false;
		}
	}
	return true;
}

async function validateAndBuildWorkflows(
	paths: BuildPaths,
): Promise<WorkflowBuildState | undefined> {
	const workflowBuildEnv = { ...process.env, WORKFLOW_TARGET_WORLD: "vercel" };
	const validate = await executeCommand(
		"pnpm",
		["exec", "workflow", "validate", "--strict"],
		paths.packageRoot,
		workflowBuildEnv,
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
		workflowBuildEnv,
	);
	if (!workflowBuild.isSuccessful) {
		console.error('Workflow build failed; `"use workflow"` packaging is broken.');
		return undefined;
	}
	return {
		vercelBuildConfig,
		workflowBuildConfig: await readJson(paths.configPath),
	};
}

async function mergeAndWriteBuildOutputConfig(
	paths: BuildPaths,
	state: WorkflowBuildState,
): Promise<void> {
	const mergedConfig = mergeBuildOutputConfig(state.vercelBuildConfig, state.workflowBuildConfig);
	await writeFile(paths.configPath, `${JSON.stringify(mergedConfig, null, 2)}\n`);
}

function printFinalSummary(
	verification: Extract<BuildOutputVerificationResult, { readonly ok: true }>,
): void {
	console.log(
		`Verified ${verification.javaScriptModuleCount} emitted modules and their relative imports across ` +
			`${verification.apiFunctionCount} source-derived API function bundles.`,
	);
	console.log(
		`Verified workflow packaging: ${verification.workflowSourceCount} workflow source(s), ` +
			`${verification.requiredWorkflowArtifactCount} required function artifacts, Queues wiring, ` +
			`${verification.routeTriggeredWorkflowIdCount} route-triggered workflow id(s) in the manifest, ` +
			"and merged Build Output routes. Deployability is predicted locally; live behavior is pending verification.",
	);
	console.log(
		`Verified final Build Output inventory (${verification.fileCount} files, ${verification.digest}).`,
	);
}

async function main(): Promise<boolean> {
	const paths = resolveBuildPaths();
	if (!(await runTypeScriptGate(paths))) return false;
	if (!(await runVercelBuildAndDiagnostics(paths))) return false;
	if (!(await makeApiFunctionBundlesHermetic(paths))) return false;
	const workflowBuild = await validateAndBuildWorkflows(paths);
	if (workflowBuild === undefined) return false;
	await mergeAndWriteBuildOutputConfig(paths, workflowBuild);
	const verification = await verifyDispatchBuildOutput({
		outputRoot: paths.outputRoot,
		apiSourceRoot: paths.apiSourceRoot,
		workflowsSourceRoot: paths.workflowsSourceRoot,
	});
	if (verification.ok === false) {
		for (const problem of verification.problems) console.error(problem);
		return false;
	}
	printFinalSummary(verification);
	return true;
}

async function executeCommand(
	command: string,
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
	const result = await runCommand(command, args, {
		cwd,
		env,
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

async function readJson(path: string): Promise<unknown> {
	return JSON.parse(await readFile(path, "utf8")) as unknown;
}

if (import.meta.main) {
	const succeeded = await main();
	if (!succeeded) process.exitCode = 1;
}
