import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { createRealNsExtensionApi } from "../../src/cli/index.ts";
import { createEmptyProject, writeModuleExtension } from "../support/cli-harness.ts";

describe("real ns extension API", () => {
	test("creates fresh APIs with the effective project and preinstalled extension identities", async () => {
		const cwd = await createEmptyProject();
		const homeDir = join(cwd, ".home");
		await writeModuleExtension(cwd);
		await writeFile(join(cwd, "ns.toml"), 'extensions = ["./extensions/acme-module"]\n');

		const first = await createRealNsExtensionApi({
			cwd,
			env: { HOME: homeDir },
			homeDir,
		});
		const second = await createRealNsExtensionApi({
			cwd,
			env: { HOME: homeDir },
			homeDir,
		});

		expect(first).not.toBe(second);
		expect(first.textGenerator).not.toBe(second.textGenerator);
		expect(first.cwd).toBe(cwd);
		expect(first.env).toEqual({ HOME: homeDir });
		expect(first.homeDir).toBe(homeDir);
		expect(first.hasExtension("@acme/module")).toBe(true);
		expect(first.hasExtension("@nseng-ai/ns-init")).toBe(true);
		expect(first.hasExtension("@nseng-ai/harness-artifacts")).toBe(true);
		expect(first.hasExtension("@acme/module/ns-extension")).toBe(false);
		expect(first.hasExtension("@nseng-ai/ns-init/ns-extension")).toBe(false);
	});

	test("does not render catalog diagnostics and honors explicit presentation hooks", async () => {
		const cwd = await createEmptyProject();
		const stdout: string[] = [];
		const stderr: string[] = [];
		const output: string[] = [];
		const progress: string[] = [];
		await writeFile(join(cwd, "ns.toml"), 'extensions = ["./missing-extension"]\n');

		const api = await createRealNsExtensionApi({
			cwd,
			env: {},
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			renderCapabilities: { canEmitAnsi: false },
			outputFormat: "json",
			onOutput: (stream, text) => output.push(`${stream}:${text}`),
			onProgress: (event) => progress.push(event.type),
			confirm: () => true,
		});

		expect(stdout).toEqual([]);
		expect(stderr).toEqual([]);
		expect(api.renderCapabilities).toEqual({ canEmitAnsi: false });
		expect(api.outputFormat).toBe("json");
		expect(await api.confirm?.("title", "message")).toBe(true);
		api.commandIo.phase("working");
		api.commandIo.notify("done");
		api.progress.phase({ type: "phase-started", phaseKey: "work" });
		expect(output).toEqual(["stderr:working\n"]);
		expect(stdout).toEqual(["done\n"]);
		expect(progress).toEqual(["phase-started"]);
	});
});
