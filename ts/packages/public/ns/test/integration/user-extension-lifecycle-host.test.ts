import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
						diagnostics: [{ code: "user-npm-managed-storage-unavailable" }],
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

		for (const operation of ["install", "update", "uninstall"] as const) {
			const npm = await run(["extension", operation, "npm:@test/tools", "--scope", "user"], {
				cwd: invocation,
				xdgConfigHome,
			});
			expect(npm.exit).toBe(2);
			expect(parseJsonOutput(npm)).toMatchObject({
				status: "failure",
				data: { code: "user-npm-managed-storage-unavailable" },
			});
		}

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
});

async function run(
	args: readonly string[],
	options: { readonly cwd: string; readonly xdgConfigHome: string },
): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const exit = await runNsCli([...args, "--format", "json"], {
		cwd: options.cwd,
		homeDir: options.cwd,
		env: { HOME: options.cwd, XDG_CONFIG_HOME: options.xdgConfigHome },
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exit, stdout: stdout.join(""), stderr: stderr.join("") };
}
