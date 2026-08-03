import { chmod, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";

import { commandSucceeded, runCommand } from "@nseng-ai/foundation/exec";

import { describe, expect, test } from "vitest";

import { runNsCli } from "../../src/cli/index.ts";
import { createEmptyProject, parseJsonOutput } from "../support/cli-harness.ts";

interface RunResult {
	readonly exit: number;
	readonly stdout: string;
	readonly stderr: string;
}

describe("user extension lifecycle host", () => {
	test("installs, discovers, lists, updates, and uninstalls outside Git without repository artifacts", async () => {
		const root = await createEmptyProject();
		const invocation = join(root, "unrelated");
		const packageRoot = join(root, "extension");
		const xdgConfigHome = join(root, "xdg-config");
		await mkdir(join(packageRoot, "src", "commands"), { recursive: true });
		await mkdir(invocation, { recursive: true });
		await writeFile(
			join(packageRoot, "package.json"),
			JSON.stringify({
				name: "@test/user-tools",
				version: "1.0.0",
				type: "module",
				exports: { "./ns-extension": "./src/extension.ts" },
			}),
		);
		await writeFile(
			join(packageRoot, "src", "extension.ts"),
			`import { defineExtension } from "@nseng-ai/sdk";
export default defineExtension({
 description: "User tools.",
 entries: [{ name: "user-tools-proof", load: async () => await import("./commands/proof.ts") }],
});
`,
		);
		await writeFile(
			join(packageRoot, "src", "commands", "proof.ts"),
			`import { defineRawCommand, ok } from "@nseng-ai/sdk";
export default defineRawCommand({
 name: "user-tools-proof",
 summary: "Proof command.",
 description: "Proof command.",
 run: () => ok({ proof: true }),
});
`,
		);
		const configPath = join(xdgConfigHome, "ns", "ns.toml");
		await mkdir(join(xdgConfigHome, "ns"), { recursive: true });
		const seeded = "# preserve\r\n[unrelated]\r\nvalue = 1\r\n";
		await writeFile(configPath, seeded);
		const beforeInvocation = await readdir(invocation);

		const installed = await run(["extension", "install", packageRoot, "--scope", "user"], {
			cwd: invocation,
			xdgConfigHome,
		});
		expect(installed.exit).toBe(0);
		expect(parseJsonOutput(installed)).toMatchObject({
			status: "ok",
			data: {
				scope: "user",
				sourceSpec: packageRoot,
				activation: "not-performed",
			},
		});
		const installedBytes = await readFile(configPath, "utf8");
		expect(installedBytes).toBe(
			`# preserve\r\nextensions = [${JSON.stringify(packageRoot)}]\r\n[unrelated]\r\nvalue = 1\r\n`,
		);

		const discovered = await run(["user-tools-proof"], {
			cwd: invocation,
			xdgConfigHome,
		});
		expect(discovered.exit).toBe(0);
		expect(parseJsonOutput(discovered)).toMatchObject({ status: "ok" });

		const npmSpec = "npm:@test/unavailable";
		const handAuthoredBytes = `# preserve\r\nextensions = [${JSON.stringify(packageRoot)}, ${JSON.stringify(npmSpec)}]\r\n[unrelated]\r\nvalue = 1\r\n`;
		await writeFile(configPath, handAuthoredBytes);
		const listed = await run(["extension", "list", "--scope", "user"], {
			cwd: invocation,
			xdgConfigHome,
		});
		expect(listed.exit).toBe(0);
		expect(parseJsonOutput(listed)).toMatchObject({
			status: "ok",
			data: {
				scope: "user",
				extensions: [
					{ sourceSpec: packageRoot, commandAvailability: "available" },
					{
						sourceSpec: npmSpec,
						commandAvailability: "unavailable",
						diagnostics: [{ code: "extension-descriptor-package-missing" }],
					},
				],
			},
		});
		expect(await readFile(configPath, "utf8")).toBe(handAuthoredBytes);
		expect(
			(
				await run(["extension", "update", packageRoot, "--scope", "user"], {
					cwd: invocation,
					xdgConfigHome,
				})
			).exit,
		).toBe(0);
		expect(await readFile(configPath, "utf8")).toBe(handAuthoredBytes);

		const uninstalled = await run(["extension", "uninstall", packageRoot, "--scope", "user"], {
			cwd: invocation,
			xdgConfigHome,
		});
		expect(uninstalled.exit).toBe(0);
		expect(await readFile(configPath, "utf8")).toBe(
			`# preserve\r\nextensions = [ ${JSON.stringify(npmSpec)}]\r\n[unrelated]\r\nvalue = 1\r\n`,
		);
		expect(await readdir(invocation)).toEqual(beforeInvocation);
	});

	test("runs the offline npm lifecycle from an unrelated non-Git directory with exact XDG storage isolation", async () => {
		const root = await createEmptyProject();
		const invocation = join(root, "unrelated");
		const packageRoot = join(root, "fixture", "user-tools");
		const tarballRoot = join(root, "tarballs");
		const binRoot = join(root, "bin");
		const npmCache = join(root, "npm-cache");
		const xdgConfigHome = join(root, "xdg-config");
		const xdgDataHome = join(root, "xdg-data");
		await mkdir(invocation, { recursive: true });
		await mkdir(packageRoot, { recursive: true });
		await mkdir(tarballRoot, { recursive: true });
		await mkdir(binRoot, { recursive: true });
		await writeFile(
			join(packageRoot, "package.json"),
			JSON.stringify({
				name: "@test/user-tools",
				version: "1.0.0",
				type: "module",
				exports: { "./ns-extension": "./extension.js" },
				scripts: {
					postinstall:
						'node -e "require(\\\"node:fs\\\").writeFileSync(\\\"lifecycle-script-ran\\\", \\\"yes\\\")"',
				},
			}),
		);
		await writeFile(
			join(packageRoot, "extension.js"),
			`export default {
 description: "Packed user tools.",
 entries: [{ name: "packed-user-proof", load: async () => await import("./proof.js") }],
};
`,
		);
		await writeFile(
			join(packageRoot, "proof.js"),
			`export default {
 name: "packed-user-proof",
 summary: "Packed proof command.",
 description: "Packed proof command.",
 run: () => ({ type: "ok", data: { proof: "packed" } }),
};
`,
		);
		const packed = await runCommand("npm", ["pack", "--pack-destination", tarballRoot], {
			cwd: packageRoot,
		});
		if (!commandSucceeded(packed)) throw new Error(`npm pack failed: ${packed.stderr}`);
		const tarballName = packed.stdout.trim().split("\n").at(-1);
		if (tarballName === undefined || tarballName === "")
			throw new Error("npm pack returned no tarball filename.");
		const tarball = join(tarballRoot, tarballName);
		const npmLookup = await runCommand("sh", ["-c", "command -v npm"]);
		if (!commandSucceeded(npmLookup)) throw new Error("Could not locate npm.");
		const npmExecutable = npmLookup.stdout.trim();
		const wrapper = join(binRoot, "npm");
		await writeFile(
			wrapper,
			`#!/bin/bash
args=("$@")
last=$((${"${#args[@]}"} - 1))
if [[ "${"${args[$last]}"}" == "@test/user-tools" ]]; then
  args[$last]=${JSON.stringify(tarball)}
fi
exec ${JSON.stringify(npmExecutable)} "${"${args[@]}"}" --offline
`,
		);
		await chmod(wrapper, 0o755);
		const env = {
			HOME: join(root, "home"),
			PATH: `${binRoot}${delimiter}${process.env.PATH ?? ""}`,
			XDG_CONFIG_HOME: xdgConfigHome,
			XDG_DATA_HOME: xdgDataHome,
			npm_config_cache: npmCache,
		};
		const npmSpec = "npm:@test/user-tools";
		const projectRoot = join(xdgDataHome, "ns", "extensions", "npm", "@test", "user-tools");
		const installedPackageRoot = join(projectRoot, "node_modules", "@test", "user-tools");
		const sibling = join(xdgDataHome, "ns", "extensions", "npm", "@test", "sibling");
		await mkdir(sibling, { recursive: true });
		await writeFile(join(sibling, "keep"), "yes");
		const beforeInvocation = await readdir(invocation);

		const installed = await run(["extension", "install", npmSpec, "--scope", "user"], {
			cwd: invocation,
			xdgConfigHome,
			xdgDataHome,
			env,
		});
		expect(installed.exit).toBe(0);
		expect(parseJsonOutput(installed)).toMatchObject({
			status: "ok",
			data: {
				sourceKind: "npm",
				acquisitionOutcome: "installed",
				moduleRoot: installedPackageRoot,
			},
		});
		await expect(readFile(join(projectRoot, "package.json"), "utf8")).resolves.toContain(
			'"private": true',
		);
		await expect(lstat(join(projectRoot, "package-lock.json"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(lstat(join(installedPackageRoot, "lifecycle-script-ran"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		expect(await readFile(join(xdgConfigHome, "ns", "ns.toml"), "utf8")).toBe(
			`extensions = [${JSON.stringify(npmSpec)}]\n`,
		);
		expect(await readdir(invocation)).toEqual(beforeInvocation);

		const discovered = await run(["packed-user-proof"], {
			cwd: invocation,
			xdgConfigHome,
			xdgDataHome,
			env,
		});
		expect(discovered.exit).toBe(0);
		expect(parseJsonOutput(discovered)).toMatchObject({ status: "ok", data: { proof: "packed" } });
		const listed = await run(["extension", "list", "--scope", "user"], {
			cwd: invocation,
			xdgConfigHome,
			xdgDataHome,
			env,
		});
		expect(parseJsonOutput(listed)).toMatchObject({
			status: "ok",
			data: { extensions: [{ sourceKind: "npm", moduleRoot: installedPackageRoot }] },
		});
		const updated = await run(["extension", "update", npmSpec, "--scope", "user"], {
			cwd: invocation,
			xdgConfigHome,
			xdgDataHome,
			env,
		});
		expect(parseJsonOutput(updated)).toMatchObject({
			status: "ok",
			data: { acquisitionIntent: "refresh-floating", acquisitionOutcome: "refreshed" },
		});
		await expect(lstat(join(projectRoot, "package-lock.json"))).rejects.toMatchObject({
			code: "ENOENT",
		});
		const uninstalled = await run(["extension", "uninstall", npmSpec, "--scope", "user"], {
			cwd: invocation,
			xdgConfigHome,
			xdgDataHome,
			env,
		});
		expect(parseJsonOutput(uninstalled)).toMatchObject({
			status: "ok",
			data: { cleanup: { status: "removed", path: projectRoot } },
		});
		await expect(lstat(projectRoot)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(readFile(join(sibling, "keep"), "utf8")).resolves.toBe("yes");
		expect(await readFile(join(xdgConfigHome, "ns", "ns.toml"), "utf8")).toBe("extensions = []\n");
		expect(await readdir(invocation)).toEqual(beforeInvocation);
	});
});

async function run(
	args: readonly string[],
	options: {
		readonly cwd: string;
		readonly xdgConfigHome: string;
		readonly xdgDataHome?: string;
		readonly env?: Readonly<Record<string, string>>;
	},
): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const exit = await runNsCli([...args, "--format", "json"], {
		cwd: options.cwd,
		homeDir: options.cwd,
		env: {
			HOME: options.cwd,
			XDG_CONFIG_HOME: options.xdgConfigHome,
			...(options.xdgDataHome === undefined ? {} : { XDG_DATA_HOME: options.xdgDataHome }),
			...options.env,
		},
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
}
