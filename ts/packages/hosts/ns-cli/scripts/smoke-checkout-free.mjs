#!/usr/bin/env node
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempRoot = await mkdtemp(join(tmpdir(), "ns-cli-checkout-free-"));

try {
	const pack = await run("pnpm", ["run", "pack:local"], { cwd: packageRoot });
	const tarball = resolveTarball(pack.stdout);
	await writeFile(join(tempRoot, "package.json"), '{"private":true,"type":"module"}\n');
	await run("git", ["init"], { cwd: tempRoot });
	await run("npm", ["install", "--silent", tarball], { cwd: tempRoot });

	const nsBin = join(
		tempRoot,
		"node_modules",
		".bin",
		process.platform === "win32" ? "ns.cmd" : "ns",
	);
	const installedPackageRoot = join(tempRoot, "node_modules", "@nseng-ai", "ns");
	const installedCli = join(installedPackageRoot, "bin", "ns.js");
	await assertInstalledPackageBoundary(nsBin, installedCli);

	const help = await run(nsBin, ["init", "--help"], { cwd: tempRoot });
	if (!help.stdout.includes("Usage: ns init")) {
		throw new Error("Packed ns CLI did not render init help.");
	}
	const rootHelp = await run(nsBin, ["--help"], { cwd: tempRoot });
	if (rootHelp.stdout.includes("Usage: ns objective list")) {
		throw new Error("Packed ns CLI unexpectedly ships Objective commands by default.");
	}
	const kernelSdkImport = await run(
		"node",
		[
			"--input-type=module",
			"--eval",
			'import { defineExtension, ok, z } from "@nseng-ai/ns/kernel/sdk"; const extension = defineExtension({ name: "smoke", commands: [] }); if (extension.name !== "smoke" || ok({}).ok !== true || typeof z.object !== "function") throw new Error("bad kernel sdk export");',
		],
		{ cwd: tempRoot },
	);
	if (kernelSdkImport.stderr !== "") {
		throw new Error(`Packed ns kernel SDK import wrote to stderr:\n${kernelSdkImport.stderr}`);
	}
	process.stdout.write(`checkout-free smoke passed: ${tempRoot}\n`);
} finally {
	if (process.env.NS_CLI_KEEP_SMOKE_DIR !== "1") {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

async function assertInstalledPackageBoundary(nsBin, installedCli) {
	const cliSource = await readFile(installedCli, "utf8");
	if (!cliSource.startsWith("#!/usr/bin/env node\n")) {
		throw new Error("Installed ns CLI is not a prebuilt executable JS file with a node shebang.");
	}
	if (cliSource.includes("run_checkout") || cliSource.includes("ts/node_modules")) {
		throw new Error("Installed ns CLI appears to include the source checkout shim boundary.");
	}
	if (process.platform !== "win32") {
		const resolvedBin = await realpath(nsBin);
		const resolvedCli = await realpath(installedCli);
		if (resolvedBin !== resolvedCli) {
			throw new Error(`Installed .bin/ns does not resolve to packaged bin/ns.js: ${resolvedBin}`);
		}
	}
}

function resolveTarball(stdout) {
	const matches = stdout.match(/[^\s]+\.tgz/g) ?? [];
	const tarball = matches.at(-1);
	if (tarball === undefined) {
		throw new Error(`Could not find packed tarball in output:\n${stdout}`);
	}
	return resolve(packageRoot, "dist", tarball);
}

function run(command, args, options) {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code, signal) => {
			if (code === 0) {
				resolvePromise({ stdout, stderr });
				return;
			}
			reject(
				new Error(
					`${command} ${args.join(" ")} failed with ${signal ?? code}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
				),
			);
		});
	});
}
