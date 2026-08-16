import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runForCliTest } from "@nseng-ai/clinkr/app/testing";
import { noopNsCommandIo, noopNsProgress, type NsExtensionApi } from "@nseng-ai/sdk";
import { afterEach, describe, expect, test } from "vitest";

import { buildNsApp } from "../../src/cli/index.ts";
import { loadNsCommandSourceInventory } from "../../src/extensions/source-inventory.ts";

const tempDirectories: string[] = [];
const require = createRequire(import.meta.url);
const sdkEntry = require.resolve("@nseng-ai/sdk");

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("source-dev command precedence", () => {
	test("executes the source-dev implementation instead of a same-name User package", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-source-dev-precedence-"));
		tempDirectories.push(root);
		const checkout = join(root, "checkout");
		const packagesRoot = join(checkout, "ts", "packages");
		const homeDir = join(root, "home");
		mkdirSync(join(packagesRoot, "public", "sdk", "src"), { recursive: true });

		const sourceDevPackageRoot = join(packagesRoot, "incubating", "extensions", "source-dev-probe");
		writeCommandPackage(sourceDevPackageRoot, "@example/probe", "SOURCE_DEV");
		const userPackageRoot = join(homeDir, "extensions", "user-probe");
		writeCommandPackage(userPackageRoot, "@example/probe", "USER");
		writeFile(
			join(homeDir, ".config", "ns", "ns.toml"),
			`extensions = [${JSON.stringify(userPackageRoot)}]\n`,
		);

		const inventory = await loadNsCommandSourceInventory({
			cwd: checkout,
			homeDir,
			env: { HOME: homeDir },
			sourceDevPackagesRoot: packagesRoot,
		});
		const run = await runForCliTest(buildNsApp({ inventory }), ["probe"], {
			context: createContext({ cwd: checkout, homeDir, inventory }),
		});

		expect(
			inventory.sources.filter((source) => source.package?.name === "@example/probe"),
		).toMatchObject([
			{
				label: `source-dev:${join("incubating", "extensions", "source-dev-probe")}`,
				kind: "preinstalled",
				origin: "package",
			},
		]);
		expect(run).toEqual({ exitCode: 0, stdout: "SOURCE_DEV\n", stderr: "" });
	});
});

function writeCommandPackage(packageRoot: string, packageName: string, output: string): void {
	writeFile(
		join(packageRoot, "package.json"),
		JSON.stringify({
			name: packageName,
			version: "1.0.0",
			type: "module",
			exports: { "./ns-extension": "./src/ns-extension.ts" },
		}),
	);
	writeFile(
		join(packageRoot, "src", "ns-extension.ts"),
		`export default { description: "Probe commands.", commandDirectory: \`${"${import.meta.dirname}"}/ns/cli\` };\n`,
	);
	writeFile(
		join(packageRoot, "src", "ns", "cli", "probe", "metadata.ts"),
		'export function metadata() { return { description: "Report command source." }; }\n',
	);
	writeFile(
		join(packageRoot, "src", "ns", "cli", "probe", "command.ts"),
		`import { defineCommand, ok, z } from ${JSON.stringify(sdkEntry)};\nexport async function command() { return defineCommand({ requiresContext: true, schema: z.object({}), resultSchema: z.string(), handler: async () => ok(${JSON.stringify(output)}), renderHuman: (value) => value }); }\n`,
	);
}

function writeFile(path: string, source: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, source);
}

function createContext(options: {
	cwd: string;
	homeDir: string;
	inventory: Awaited<ReturnType<typeof loadNsCommandSourceInventory>>;
}): NsExtensionApi {
	return {
		cwd: options.cwd,
		homeDir: options.homeDir,
		env: { HOME: options.homeDir },
		hasExtension: (packageName) => options.inventory.extensionPackageNames.has(packageName),
		installedExtensionPackageNames: [...options.inventory.extensionPackageNames],
		exec: async () => ({ type: "exited", code: 0, signal: null, stdout: "", stderr: "" }),
		textGenerator: {
			generateText: async () => ({ ok: false, error: "Unexpected text generation." }),
		},
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: { canEmitAnsi: false },
		isInteractive: () => false,
		confirm: () => ({ type: "cancelled" }),
		select: () => ({ type: "cancelled" }),
	};
}
