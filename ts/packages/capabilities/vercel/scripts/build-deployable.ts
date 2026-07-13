import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

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

async function main(): Promise<boolean> {
	const packageRoot = fileURLToPath(new URL("../", import.meta.url));
	if (!(await runCommand("pnpm", ["exec", "tsc", "-p", "tsconfig.json"], packageRoot)).ok) {
		return false;
	}

	const build = await runCommand("vercel", ["build", "--prod"], packageRoot);
	if (!build.ok) return false;
	if (/\berror TS\d+:/u.test(build.output)) {
		console.error("Vercel build emitted TypeScript diagnostics despite exiting successfully.");
		return false;
	}

	const functionRoot = fileURLToPath(
		new URL("../.vercel/output/functions/api/mint.func/", import.meta.url),
	);
	const modules = await readJavaScriptModules(functionRoot);
	const missing = findMissingRelativeModuleTargets(modules);
	if (missing.length > 0) {
		for (const item of missing) {
			console.error(
				`Vercel function artifact is missing ${item.targetPath} imported by ${item.sourcePath}.`,
			);
		}
		return false;
	}

	console.log(`Verified ${modules.size} emitted mint-function modules and their relative imports.`);
	return true;
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
): Promise<{ readonly ok: boolean; readonly output: string }> {
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
			resolve({ ok: false, output });
		});
		child.on("close", (code) => resolve({ ok: code === 0, output }));
	});
}

if (import.meta.main) {
	const succeeded = await main();
	if (!succeeded) process.exitCode = 1;
}
