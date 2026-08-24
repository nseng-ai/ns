import { describe, expect, test } from "vitest";
import { z } from "zod";

import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import type { GitOptionalResult } from "@nseng-ai/foundation/git";
import {
	createEffectiveProjectConfig,
	createNodeEffectiveProjectConfig,
	type EffectiveProjectConfigScope,
} from "../../src/project-config/effective.ts";
import type { ProjectSetting } from "../../src/project-config/points.ts";

const cwd = "/repo/nested/work";
const commands: CommandExecApi = {
	async exec() {
		throw new Error("unexpected command");
	},
};
const nameSetting = {
	path: ["project", "name"] as const,
	schema: z.string().min(1),
} satisfies ProjectSetting<string>;
const countSetting = {
	path: ["project", "count"] as const,
	schema: z.number().int(),
	invalidMessage: ({ pathLabel }) => `${pathLabel}: project count must be an integer.`,
} satisfies ProjectSetting<number>;

interface FakeState {
	readonly root?: GitOptionalResult<string>;
	readonly source?: string;
	readonly readError?: Error;
}

function fixture(state: FakeState = {}) {
	const roots: EffectiveProjectConfigScope[] = [];
	const reads: Array<{ path: string; signal?: AbortSignal }> = [];
	const scope: EffectiveProjectConfigScope = { cwd, env: { MODE: "test" }, commands };
	const config = createEffectiveProjectConfig(scope, {
		async discoverRoot(input) {
			roots.push(input);
			return state.root ?? { type: "found", value: "/repo" };
		},
		async readTextFile(path, signal) {
			reads.push({ path, ...(signal === undefined ? {} : { signal }) });
			if (state.readError !== undefined) throw state.readError;
			return state.source;
		},
	});
	return { config, roots, reads, scope };
}

describe("effective project config", () => {
	test("reads a configured setting from a nested cwd with provenance", async () => {
		const { config, roots, reads } = fixture({ source: '[project]\nname = "ns"\n' });

		await expect(config.get(nameSetting)).resolves.toEqual({
			ok: true,
			value: {
				value: "ns",
				provenance: {
					source: "project",
					path: "/repo/ns.toml",
					settingPath: ["project", "name"],
				},
			},
		});
		expect(roots).toHaveLength(1);
		expect(roots[0]?.cwd).toBe(cwd);
		expect(reads).toEqual([{ path: "/repo/ns.toml" }]);
	});

	test.each([
		{ source: undefined, label: "missing source" },
		{ source: "[other]\nvalue = 1\n", label: "absent setting" },
	])("returns absence for $label", async ({ source }) => {
		const { config } = fixture(source === undefined ? {} : { source });
		await expect(config.get(nameSetting)).resolves.toEqual({ ok: true, value: undefined });
	});

	test("uses the supplied command capability for exact Git discovery with copied scope", async () => {
		const signal = new AbortController().signal;
		const env: Record<string, string | undefined> = { MODE: "before" };
		const calls: Array<{
			command: string;
			args: string[];
			options: Parameters<CommandExecApi["exec"]>[2];
		}> = [];
		const config = createNodeEffectiveProjectConfig({
			cwd,
			env,
			signal,
			commands: {
				async exec(command, args, options) {
					calls.push({ command, args: [...args], options });
					return {
						type: "exited",
						code: 128,
						signal: null,
						stdout: "",
						stderr: "fatal: not a git repository",
					};
				},
			},
		});
		env.MODE = "after";

		await expect(config.get(nameSetting)).resolves.toMatchObject({
			ok: false,
			error: { code: "project-not-found", cwd },
		});
		expect(calls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd, env: { MODE: "before" }, signal, timeout: 10_000 },
			},
		]);
	});

	test("classifies a cwd outside a project", async () => {
		const { config, reads } = fixture({ root: { type: "missing" } });
		await expect(config.get(nameSetting)).resolves.toEqual({
			ok: false,
			error: {
				code: "project-not-found",
				cwd,
			},
		});
		expect(reads).toEqual([]);
	});

	test("classifies project discovery failure", async () => {
		const { config } = fixture({
			root: { type: "error", error: { code: "repo_root_failed", message: "git failed" } },
		});
		await expect(config.get(nameSetting)).resolves.toEqual({
			ok: false,
			error: { code: "project-discovery-failed", cwd, message: "git failed" },
		});
	});

	test("classifies source read failure with the absolute path", async () => {
		const { config } = fixture({ readError: new Error("permission denied") });
		await expect(config.get(nameSetting)).resolves.toEqual({
			ok: false,
			error: {
				code: "source-read-failed",
				path: "/repo/ns.toml",
				message: "permission denied",
			},
		});
	});

	test("classifies malformed TOML separately from an invalid setting", async () => {
		const malformed = fixture({ source: "[project\nname =" });
		const invalid = fixture({ source: '[project]\ncount = "many"\n' });

		const malformedResult = await malformed.config.get(nameSetting);
		expect(malformedResult).toMatchObject({
			ok: false,
			error: { code: "invalid-source", path: "/repo/ns.toml" },
		});
		if (!malformedResult.ok) {
			expect(malformedResult.error).toHaveProperty("diagnostics");
		}
		await expect(invalid.config.get(countSetting)).resolves.toEqual({
			ok: false,
			error: {
				code: "invalid-setting",
				path: "/repo/ns.toml",
				settingPath: ["project", "count"],
				message: "/repo/ns.toml: project count must be an integer.",
			},
		});
	});

	test("parses settings independently while sharing one snapshot", async () => {
		const { config, roots, reads } = fixture({
			source: '[project]\nname = "ns"\ncount = "invalid"\n',
		});

		await expect(config.get(nameSetting)).resolves.toMatchObject({
			ok: true,
			value: { value: "ns" },
		});
		await expect(config.get(countSetting)).resolves.toMatchObject({
			ok: false,
			error: { code: "invalid-setting" },
		});
		expect(roots).toHaveLength(1);
		expect(reads).toHaveLength(1);
	});

	test("shares concurrent discovery and read work", async () => {
		let release: ((source: string) => void) | undefined;
		let discoveries = 0;
		let reads = 0;
		const config = createEffectiveProjectConfig(
			{ cwd, env: {}, commands },
			{
				async discoverRoot() {
					discoveries += 1;
					return { type: "found", value: "/repo" };
				},
				readTextFile() {
					reads += 1;
					return new Promise((resolve) => {
						release = resolve;
					});
				},
			},
		);

		const first = config.get(nameSetting);
		const second = config.get(countSetting);
		await Promise.resolve();
		release?.('[project]\nname = "ns"\ncount = 2\n');
		await expect(Promise.all([first, second])).resolves.toMatchObject([
			{ ok: true, value: { value: "ns" } },
			{ ok: true, value: { value: 2 } },
		]);
		expect({ discoveries, reads }).toEqual({ discoveries: 1, reads: 1 });
	});

	test("copies env, forwards signal, and snapshots one capability", async () => {
		const signal = new AbortController().signal;
		const env: Record<string, string | undefined> = { MODE: "before" };
		let source = '[project]\nname = "first"\n';
		const seenEnv: Array<Readonly<Record<string, string | undefined>>> = [];
		const dependencies = {
			async discoverRoot(scope: EffectiveProjectConfigScope) {
				seenEnv.push(scope.env);
				return { type: "found" as const, value: "/repo" };
			},
			async readTextFile(_path: string, seenSignal?: AbortSignal) {
				expect(seenSignal).toBe(signal);
				return source;
			},
		};
		const first = createEffectiveProjectConfig({ cwd, env, commands, signal }, dependencies);
		env.MODE = "after";
		await expect(first.get(nameSetting)).resolves.toMatchObject({
			ok: true,
			value: { value: "first" },
		});
		source = '[project]\nname = "second"\n';
		await expect(first.get(nameSetting)).resolves.toMatchObject({
			ok: true,
			value: { value: "first" },
		});
		const second = createEffectiveProjectConfig({ cwd, env, commands, signal }, dependencies);
		await expect(second.get(nameSetting)).resolves.toMatchObject({
			ok: true,
			value: { value: "second" },
		});
		expect(seenEnv).toEqual([{ MODE: "before" }, { MODE: "after" }]);
	});
});
