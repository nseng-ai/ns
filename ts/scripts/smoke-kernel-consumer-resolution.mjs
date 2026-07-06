#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

import { kernelPublicSubpaths } from "./kernel-public-subpaths.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishRoot = process.argv[2];
if (publishRoot === undefined) throw new Error("Usage: node scripts/smoke-kernel-consumer-resolution.mjs <kernel-publish-root>");

const tempRoot = await mkdtemp(join(tmpdir(), "ns-kernel-consumer-"));
try {
	await writeFile(join(tempRoot, "package.json"), JSON.stringify({ private: true, type: "module" }, null, "\t") + "\n");
	await writeFile(
		join(tempRoot, "tsconfig.json"),
		JSON.stringify(
			{
				compilerOptions: {
					target: "ES2024",
					module: "NodeNext",
					moduleResolution: "NodeNext",
					strict: true,
					allowImportingTsExtensions: true,
					noEmit: true,
					skipLibCheck: true,
				},
				include: ["consumer.ts"],
			},
			null,
			"\t",
		) + "\n",
	);
	await writeFile(join(tempRoot, "consumer.ts"), consumerSource());
	run("npm", ["install", "--silent", resolve(publishRoot)], { cwd: tempRoot });
	run(resolve(workspaceRoot, "node_modules", ".bin", "tsgo"), ["-p", "tsconfig.json"], { cwd: tempRoot });
	console.log(`kernel consumer resolution smoke passed: ${tempRoot}`);
} finally {
	if (process.env.NS_KERNEL_KEEP_SMOKE_DIR !== "1") await rm(tempRoot, { recursive: true, force: true });
}

function consumerSource() {
	return kernelPublicSubpaths.map((subpath) => `import type * as ${identifierForSubpath(subpath)} from "@nseng-ai/kernel/${subpath}";`).join("\n")
		+ "\n"
		+ kernelPublicSubpaths.map((subpath) => `type ${identifierForSubpath(subpath)}Keys = keyof typeof ${identifierForSubpath(subpath)};`).join("\n")
		+ "\n"
		+ "export {};\n";
}

function identifierForSubpath(subpath) {
	return subpath.replace(/[^a-zA-Z0-9]/g, "_");
}

function run(command, args, options) {
	const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8", stdio: "pipe" });
	if (result.status === 0) return;
	throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}
