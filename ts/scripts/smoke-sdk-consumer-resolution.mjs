#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

import { sdkFoldEntries } from "./sdk-public-subpaths.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishRoot = process.argv[2];
if (publishRoot === undefined) throw new Error("Usage: node scripts/smoke-sdk-consumer-resolution.mjs <sdk-publish-root>");

const tempRoot = await mkdtemp(join(tmpdir(), "ns-sdk-consumer-"));
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
	console.log(`sdk consumer resolution smoke passed: ${tempRoot}`);
} finally {
	if (process.env.NS_SDK_KEEP_SMOKE_DIR !== "1") await rm(tempRoot, { recursive: true, force: true });
}

function consumerSource() {
	return sdkFoldEntries.map((entry) => `import type * as ${identifierForEntry(entry)} from "${consumerSpecifier(entry)}";`).join("\n")
		+ "\n"
		+ sdkFoldEntries.map((entry) => `type ${identifierForEntry(entry)}Keys = keyof typeof ${identifierForEntry(entry)};`).join("\n")
		+ "\n"
		+ "export {};\n";
}

function consumerSpecifier(entry) {
	return entry.sourceExport === "." ? "@nseng-ai/sdk" : `@nseng-ai/sdk/${entry.name}`;
}

function identifierForEntry(entry) {
	return entry.name.replace(/[^a-zA-Z0-9]/g, "_");
}

function run(command, args, options) {
	const result = spawnSync(command, args, { cwd: options.cwd, encoding: "utf8", stdio: "pipe" });
	if (result.status === 0) return;
	throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}
