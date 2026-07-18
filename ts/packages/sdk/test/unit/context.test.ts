import process from "node:process";

import { describe, expect, test } from "vitest";

import {
	createNsExtensionApi,
	createRealNsCommandContext,
	type NsCliBaseContext,
} from "@nseng-ai/sdk/context";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";

describe("complete ns extension API", () => {
	test("assembles every capability from explicit execution and presentation inputs", async () => {
		const baseOutput: string[] = [];
		const overrideOutput: string[] = [];
		const stdout: string[] = [];
		const stderr: string[] = [];
		const progressEvents: string[] = [];
		const extensions = { projectValue: "value" };
		const baseContext: NsCliBaseContext = {
			cwd: "/base",
			env: { SOURCE: "base" },
			homeDir: "/base/home",
			textGenerator: {
				generateText: async () => ({ ok: false, error: "not used" }),
			},
			commandIo: noopNsCommandIo,
			progress: noopNsProgress,
			renderCapabilities: { canEmitAnsi: false },
			outputFormat: "human",
			exec: async () => ({ type: "exited", code: 0, signal: null, stdout: "ok", stderr: "" }),
			stdout: (text) => baseOutput.push(`stdout:${text}`),
			stderr: (text) => baseOutput.push(`stderr:${text}`),
			stdin: async () => "base stdin",
			onOutput: (stream, text) => baseOutput.push(`${stream}:${text}`),
			confirm: () => false,
			extensions,
		};
		const extensionPackageNames = new Set(["@example/present"]);
		const api = createNsExtensionApi({
			baseContext,
			cwd: "/selected",
			env: { SOURCE: "selected" },
			homeDir: "/selected/home",
			extensionPackageNames,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			renderCapabilities: {
				canEmitAnsi: true,
				caps: { isTty: true, colorDepth: "ansi256", columns: 120, canRenderUnicode: true },
			},
			outputFormat: "json",
			stdin: async () => "base stdin",
			onOutput: (stream, text) => overrideOutput.push(`${stream}:${text}`),
			onProgress: (event) => progressEvents.push(event.type),
			confirm: () => true,
		});

		expect(Object.keys(api).sort()).toEqual(
			[
				"commandIo",
				"confirm",
				"cwd",
				"env",
				"exec",
				"extensions",
				"hasExtension",
				"homeDir",
				"onOutput",
				"outputFormat",
				"progress",
				"renderCapabilities",
				"stderr",
				"stdin",
				"stdout",
				"textGenerator",
			].sort(),
		);
		expect(api).toMatchObject({
			cwd: "/selected",
			env: { SOURCE: "selected" },
			homeDir: "/selected/home",
			outputFormat: "json",
			renderCapabilities: {
				canEmitAnsi: true,
				caps: { isTty: true, colorDepth: "ansi256", columns: 120, canRenderUnicode: true },
			},
			extensions,
		});
		expect(api.textGenerator).toBe(baseContext.textGenerator);
		expect(api.hasExtension("@example/present")).toBe(true);
		expect(api.hasExtension("@example/present ")).toBe(false);
		expect(await api.exec("ignored", [])).toMatchObject({ stdout: "ok" });
		expect(await api.stdin?.()).toBe("base stdin");
		expect(await api.confirm?.("title", "message")).toBe(true);

		api.commandIo.phase("working");
		api.commandIo.notify("done");
		api.progress.phase({ type: "phase-started", phaseKey: "work" });
		expect(overrideOutput).toEqual(["stderr:working\n"]);
		expect(stdout).toEqual(["done\n"]);
		expect(stderr).toEqual([]);
		expect(progressEvents).toEqual(["phase-started"]);
		expect(baseOutput).toEqual([]);
	});

	test("omits optional presentation callbacks unless explicitly supplied", () => {
		const output: string[] = [];
		const baseContext: NsCliBaseContext = {
			cwd: "/base",
			env: {},
			textGenerator: {
				generateText: async () => ({ ok: false, error: "not used" }),
			},
			commandIo: noopNsCommandIo,
			progress: noopNsProgress,
			renderCapabilities: { canEmitAnsi: false },
			exec: async () => ({ type: "exited", code: 0, signal: null, stdout: "", stderr: "" }),
			onOutput: (stream, text) => output.push(`${stream}:${text}`),
			confirm: () => true,
		};
		const api = createNsExtensionApi({
			baseContext,
			cwd: "/selected",
			env: {},
			extensionPackageNames: new Set(),
			stdout: () => {},
			stderr: () => {},
			renderCapabilities: { canEmitAnsi: false },
			outputFormat: "human",
		});

		api.commandIo.phase("not inherited");
		expect(output).toEqual([]);
		expect(api.stdin).toBeUndefined();
		expect(api.onOutput).toBeUndefined();
		expect(api.confirm).toBeUndefined();
		expect(api.progress).toBe(noopNsProgress);
	});
});

describe("real ns command context", () => {
	test("keeps context-only environment settings out of child processes", async () => {
		const ctx = createRealNsCommandContext({
			cwd: process.cwd(),
			env: { NS_FAST_MODEL: "vercel-ai-gateway/openai/gpt-5.6-luna" },
			execEnv: {},
			textGenerator: {
				generateText: async () => ({ ok: false, error: "not used" }),
			},
		});

		expect(ctx.env.NS_FAST_MODEL).toBe("vercel-ai-gateway/openai/gpt-5.6-luna");
		const result = await ctx.exec(process.execPath, [
			"-e",
			"process.stdout.write(process.env.NS_FAST_MODEL ?? 'unset')",
		]);
		expect(result).toMatchObject({ code: 0, stdout: "unset", stderr: "" });
	});

	test("forwards stdin to executed commands", async () => {
		const ctx = createRealNsCommandContext({
			cwd: process.cwd(),
			env: process.env,
			textGenerator: {
				generateText: async () => ({ ok: false, error: "not used" }),
			},
		});

		expect("hasExtension" in ctx).toBe(false);

		const result = await ctx.exec(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], {
			stdin: "hello from stdin",
		});

		expect(result).toMatchObject({ code: 0, stdout: "hello from stdin", stderr: "" });
	});
});
