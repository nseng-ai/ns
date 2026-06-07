import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import process from "node:process";
import { dirname, join } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const MAX_PARALLEL_WORKSPACE_TESTS = 2;
const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

interface WorkspaceTest {
	readonly dir: string;
	readonly label: string;
}

interface WorkspaceResult {
	readonly label: string;
	readonly exitCode: number;
}

async function main(): Promise<void> {
	const workspaces = await discoverWorkspaceTests();
	if (workspaces.length === 0) {
		console.log("[js-test] No workspace test scripts found.");
		return;
	}

	console.log(
		`[js-test] Running ${workspaces.length} workspace test scripts with parallelism ${MAX_PARALLEL_WORKSPACE_TESTS}.`,
	);
	const results = await runWorkspaceTests(workspaces);
	const failures = results.filter((result) => result.exitCode !== 0);
	if (failures.length > 0) {
		for (const failure of failures) {
			console.error(`[js-test] ${failure.label} failed with exit code ${failure.exitCode}.`);
		}
		process.exitCode = 1;
		return;
	}

	console.log("[js-test] All workspace test scripts passed.");
}

async function discoverWorkspaceTests(): Promise<WorkspaceTest[]> {
	const rootPackageJson = await readJsonObject(join(ROOT_DIR, "package.json"));
	const workspaceDirs = await discoverWorkspaceDirs(rootPackageJson);
	const workspaceTests: WorkspaceTest[] = [];

	for (const dir of workspaceDirs) {
		const packageJson = await readJsonObject(join(dir, "package.json"));
		if (!hasScript(packageJson, "test")) continue;
		workspaceTests.push({ dir, label: packageLabel(packageJson, dir) });
	}

	return workspaceTests;
}

async function discoverWorkspaceDirs(rootPackageJson: Record<string, unknown>): Promise<string[]> {
	const patterns = workspacePatterns(rootPackageJson);
	const dirs = new Set<string>();

	for (const pattern of patterns) {
		if (!pattern.endsWith("/*")) {
			throw new Error(`Unsupported workspace pattern for JS test runner: ${pattern}`);
		}
		const parentDir = join(ROOT_DIR, pattern.slice(0, -2));
		const entries = await readdir(parentDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) dirs.add(join(parentDir, entry.name));
		}
	}

	return [...dirs].sort();
}

function workspacePatterns(rootPackageJson: Record<string, unknown>): string[] {
	const workspaces = rootPackageJson.workspaces;
	if (isStringArray(workspaces)) return workspaces;

	const workspaceObject = asRecord(workspaces);
	if (workspaceObject !== undefined && isStringArray(workspaceObject.packages)) {
		return workspaceObject.packages;
	}

	throw new Error("Root package.json does not define workspace patterns.");
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
	const text = await readFile(path, "utf8");
	const parsed: unknown = JSON.parse(text);
	const object = asRecord(parsed);
	if (object === undefined) throw new Error(`${path} must contain a JSON object.`);
	return object;
}

function hasScript(packageJson: Record<string, unknown>, scriptName: string): boolean {
	const scripts = asRecord(packageJson.scripts);
	return scripts !== undefined && typeof scripts[scriptName] === "string";
}

function packageLabel(packageJson: Record<string, unknown>, dir: string): string {
	return typeof packageJson.name === "string" ? packageJson.name : dir;
}

async function runWorkspaceTests(workspaces: readonly WorkspaceTest[]): Promise<WorkspaceResult[]> {
	let nextIndex = 0;
	const results: WorkspaceResult[] = [];

	async function worker(): Promise<void> {
		while (nextIndex < workspaces.length) {
			const workspace = workspaces[nextIndex];
			nextIndex += 1;
			if (workspace === undefined) continue;
			results.push(await runWorkspaceTest(workspace));
		}
	}

	const workerCount = Math.min(MAX_PARALLEL_WORKSPACE_TESTS, workspaces.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

async function runWorkspaceTest(workspace: WorkspaceTest): Promise<WorkspaceResult> {
	console.log(`[js-test] ${workspace.label}: bun run --cwd ${workspace.dir} test`);
	const child = spawn("bun", ["run", "--cwd", workspace.dir, "test"], {
		cwd: ROOT_DIR,
		env: process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	const stdoutDone = pipePrefixed(child.stdout, process.stdout, `${workspace.label} test: `);
	const stderrDone = pipePrefixed(child.stderr, process.stderr, `${workspace.label} test: `);
	const exitCode = await childExitCode(child, workspace.label);
	await Promise.all([stdoutDone, stderrDone]);
	return { label: workspace.label, exitCode };
}

function childExitCode(child: ReturnType<typeof spawn>, label: string): Promise<number> {
	return new Promise((resolve) => {
		let isSettled = false;
		function settle(exitCode: number): void {
			if (isSettled) return;
			isSettled = true;
			resolve(exitCode);
		}

		child.on("error", (error) => {
			console.error(`[js-test] ${label}: failed to start bun: ${error.message}`);
			settle(1);
		});
		child.on("close", (code) => settle(code ?? 1));
	});
}

function pipePrefixed(readable: Readable | null, writable: NodeJS.WriteStream, prefix: string): Promise<void> {
	if (readable === null) return Promise.resolve();

	return new Promise((resolve) => {
		let pending = "";
		readable.setEncoding("utf8");
		readable.on("data", (chunk: string) => {
			const lines = `${pending}${chunk}`.split("\n");
			pending = lines.pop() ?? "";
			for (const line of lines) {
				writable.write(`${prefix}${line}\n`);
			}
		});
		readable.on("end", () => {
			if (pending.length > 0) writable.write(`${prefix}${pending}\n`);
			resolve();
		});
		readable.on("error", () => resolve());
	});
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[js-test] ${message}`);
	process.exitCode = 1;
});
