import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { runCommand, type ExecFunction } from "./command.ts";
import { derivePlanKey, STACK_PLANS_NAMESPACE, type BranchMemoryKey } from "./keys.ts";
import { parseStackPlanMarkdown, type StackPlanDocument } from "./plan.ts";

const COMMAND_TIMEOUT_MS = 30_000;

export type StackImplParsedArgs = {
	planArg: string;
	replace: boolean;
};

export type StackImplFileSystem = {
	isFile(path: string): Promise<boolean>;
	readTextFile(path: string): Promise<string>;
};

export type StackImplDependencies = {
	cwd: string;
	exec: ExecFunction;
	fileSystem?: StackImplFileSystem;
	confirmReplace?: ((message: string) => Promise<boolean>) | undefined;
	signal?: AbortSignal | undefined;
};

export type StackImplPlanResult = {
	source: "local-file" | "branch-memory";
	action: "stored" | "reused" | "replaced" | "loaded";
	planBranch: string;
	locator: BranchMemoryKey & { branch: string };
	plan: StackPlanDocument;
	localPath?: string;
};

const nodeFileSystem: StackImplFileSystem = {
	async isFile(path: string): Promise<boolean> {
		try {
			return (await stat(path)).isFile();
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT") {
				return false;
			}
			throw error;
		}
	},
	readTextFile(path: string): Promise<string> {
		return readFile(path, "utf8");
	},
};

export function parseStackImplArgs(args: string): StackImplParsedArgs {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	let replace = false;
	const operands: string[] = [];
	for (const part of parts) {
		if (part === "--replace") {
			replace = true;
			continue;
		}
		operands.push(part);
	}
	if (operands.length !== 1) {
		throw new Error("Usage: /stack-impl [--replace] <local-plan-file-or-branch-memory-key>");
	}
	return { planArg: operands[0]!, replace };
}

async function currentGitBranch(deps: StackImplDependencies): Promise<string> {
	const result = await runCommand(deps.exec, "git", ["branch", "--show-current"], {
		cwd: deps.cwd,
		signal: deps.signal,
		timeout: COMMAND_TIMEOUT_MS,
	});
	const branch = result.stdout.trim();
	if (branch.length === 0) {
		throw new Error("Cannot run stack-impl from a detached HEAD; current git branch is empty.");
	}
	return branch;
}

async function brmemCheckPlan(
	deps: StackImplDependencies,
	locator: BranchMemoryKey & { branch: string },
): Promise<boolean> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["check", locator.key, "--namespace", locator.namespace, "--branch", locator.branch],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
			acceptedCodes: [0, 1],
		},
	);
	return result.code === 0;
}

async function brmemGetPlan(
	deps: StackImplDependencies,
	locator: BranchMemoryKey & { branch: string },
): Promise<string> {
	const result = await runCommand(
		deps.exec,
		"brmem",
		["get", locator.key, "--namespace", locator.namespace, "--branch", locator.branch],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
	return result.stdout;
}

async function brmemPutPlan(
	deps: StackImplDependencies,
	locator: BranchMemoryKey & { branch: string },
	filePath: string,
): Promise<void> {
	await runCommand(
		deps.exec,
		"brmem",
		["put", locator.key, "--namespace", locator.namespace, "--branch", locator.branch, "--file", filePath],
		{
			cwd: deps.cwd,
			signal: deps.signal,
			timeout: COMMAND_TIMEOUT_MS,
		},
	);
}

function assertCanonicalPlanKey(plan: StackPlanDocument, key: string): void {
	const canonicalKey = derivePlanKey(plan.objective).key;
	if (canonicalKey !== key) {
		throw new Error(`Branch Memory plan key ${key} does not match canonical key ${canonicalKey}.`);
	}
}

async function maybeReplaceDifferingPlan(
	deps: StackImplDependencies,
	locator: BranchMemoryKey & { branch: string },
	localPath: string,
	replace: boolean,
): Promise<"replaced"> {
	if (!replace) {
		if (!deps.confirmReplace) {
			throw new Error(
				`Branch Memory plan ${locator.namespace}/${locator.key} on ${locator.branch} differs from the local file. Re-run with --replace to overwrite it.`,
			);
		}

		const confirmed = await deps.confirmReplace(
			`Branch Memory plan ${locator.namespace}/${locator.key} on ${locator.branch} differs from the local file. Replace it?`,
		);
		if (!confirmed) {
			throw new Error("Branch Memory plan replacement was not confirmed; leaving existing content unchanged.");
		}
	}

	await brmemPutPlan(deps, locator, localPath);
	return "replaced";
}

async function storeOrReuseLocalPlan(
	parsedArgs: StackImplParsedArgs,
	deps: StackImplDependencies,
	planBranch: string,
	localPath: string,
	content: string,
): Promise<StackImplPlanResult> {
	const plan = parseStackPlanMarkdown(content);
	const key = derivePlanKey(plan.objective);
	const locator = { ...key, branch: planBranch };
	const exists = await brmemCheckPlan(deps, locator);
	if (!exists) {
		await brmemPutPlan(deps, locator, localPath);
		return { source: "local-file", action: "stored", planBranch, locator, plan, localPath };
	}

	const existingContent = await brmemGetPlan(deps, locator);
	if (existingContent === content) {
		return { source: "local-file", action: "reused", planBranch, locator, plan, localPath };
	}

	const action = await maybeReplaceDifferingPlan(deps, locator, localPath, parsedArgs.replace);
	return { source: "local-file", action, planBranch, locator, plan, localPath };
}

async function loadExistingPlanKey(
	key: string,
	deps: StackImplDependencies,
	planBranch: string,
): Promise<StackImplPlanResult> {
	const locator = { namespace: STACK_PLANS_NAMESPACE, key, branch: planBranch };
	const content = await brmemGetPlan(deps, locator);
	const plan = parseStackPlanMarkdown(content);
	assertCanonicalPlanKey(plan, key);
	return { source: "branch-memory", action: "loaded", planBranch, locator, plan };
}

export async function loadOrStoreStackImplPlan(
	args: string,
	deps: StackImplDependencies,
): Promise<StackImplPlanResult> {
	const parsedArgs = parseStackImplArgs(args);
	const fileSystem = deps.fileSystem ?? nodeFileSystem;
	const planBranch = await currentGitBranch(deps);
	const localPath = resolve(deps.cwd, parsedArgs.planArg);

	if (await fileSystem.isFile(localPath)) {
		const content = await fileSystem.readTextFile(localPath);
		return storeOrReuseLocalPlan(parsedArgs, deps, planBranch, localPath, content);
	}

	return loadExistingPlanKey(parsedArgs.planArg, deps, planBranch);
}

export function formatStackImplPlanResult(result: StackImplPlanResult): string {
	const source = result.source === "local-file" ? `local file ${result.localPath}` : "Branch Memory";
	return [
		`Stack plan ${result.action} from ${source}.`,
		`Objective: ${result.plan.objective}`,
		`Plan: ${result.locator.namespace}/${result.locator.key} on ${result.locator.branch}`,
		`SHA-256: ${result.plan.sha256}`,
	].join("\n");
}
