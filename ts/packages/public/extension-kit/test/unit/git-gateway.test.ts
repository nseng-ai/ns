import { describe, expect, test } from "vitest";

import {
	configureNsGitGateway,
	loadNsGitPolicy,
	parseNsGitPolicyToml,
} from "@nseng-ai/extension-kit";
import type { ExecResult } from "@nseng-ai/foundation/exec";
import {
	noopNsCommandIo,
	noopNsProgress,
	type NsExecOptions,
	type NsExtensionApi,
} from "@nseng-ai/sdk";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

interface ExecCall {
	command: string;
	args: readonly string[];
	options?: NsExecOptions;
}

describe("ns Git policy", () => {
	test("uses neutral policy when ns.toml is missing", () => {
		expect(
			loadNsGitPolicy({ repoRoot: "/repo", gateway: projectConfig({ type: "missing" }) }),
		).toEqual({
			ok: true,
			value: { remote: "origin" },
		});
	});

	test("decodes configured remote and trunk", () => {
		expect(parseNsGitPolicyToml('[git]\nremote = "company"\ntrunk = "stable"')).toEqual({
			ok: true,
			value: { remote: "company", trunk: "stable" },
		});
	});

	test.each([
		["scalar table", 'git = "origin"'],
		["empty remote", '[git]\nremote = "  "'],
		["non-string trunk", "[git]\ntrunk = 42"],
		["unknown key", '[git]\nremote = "origin"\nextra = true'],
	])("rejects invalid Git policy: %s", (_name, source) => {
		expect(parseNsGitPolicyToml(source)).toMatchObject({
			ok: false,
			error: { code: "invalid-git-policy" },
		});
	});

	test("returns invalid TOML and read failures as values", () => {
		expect(parseNsGitPolicyToml("[git")).toMatchObject({
			ok: false,
			error: { code: "invalid-toml", diagnostics: [{ code: "ns_toml_invalid" }] },
		});
		expect(
			loadNsGitPolicy({
				repoRoot: "/repo",
				gateway: projectConfig({ type: "error", message: "permission denied" }),
			}),
		).toEqual({
			ok: false,
			error: {
				code: "ns-toml-read-failed",
				message: "Failed to read ns.toml: permission denied",
			},
		});
	});

	test("bootstraps repo root, injects config loading, and reuses the ctx exec channel", async () => {
		const { api, calls } = fakeApi((args) => {
			if (args[0] === "rev-parse") return exited({ stdout: "/repo\n" });
			if (args[0] === "check-ref-format") return exited();
			if (args[0] === "remote") return exited({ stdout: "origin\ncompany\n" });
			if (args[0] === "show-ref") return exited();
			return exited({ code: 99, stderr: `unexpected: ${args.join(" ")}` });
		});
		const configReads: string[] = [];
		const gateway = projectConfig(
			{
				type: "found",
				text: '[git]\nremote = "company"\ntrunk = "stable"',
			},
			configReads,
		);

		const configured = await configureNsGitGateway(api, { projectConfigGateway: gateway });

		expect(configured).toMatchObject({
			ok: true,
			repoRoot: "/repo",
			policy: { remote: "company", trunk: "stable" },
		});
		if (!configured.ok) throw new Error("Expected configured Git gateway.");
		expect(await configured.value.trunkBranch({ cwd: "/repo" })).toMatchObject({
			type: "resolved",
			resolution: { remote: "company", branch: "stable", source: "configured" },
		});
		expect(configReads).toEqual(["/repo/ns.toml"]);
		expect(calls.map((call) => call.args)).toEqual([
			["rev-parse", "--show-toplevel"],
			["check-ref-format", "refs/remotes/company/trunk-validation"],
			["check-ref-format", "--branch", "stable"],
			["remote"],
			["show-ref", "--verify", "--quiet", "refs/heads/stable"],
			["show-ref", "--verify", "--quiet", "refs/remotes/company/stable"],
		]);
	});

	test("does not read config when bootstrap repo-root discovery fails", async () => {
		const { api } = fakeApi(() => exited({ code: 128, stderr: "not a repository" }));
		const configReads: string[] = [];

		const result = await configureNsGitGateway(api, {
			projectConfigGateway: projectConfig({ type: "missing" }, configReads),
		});

		expect(result).toMatchObject({ ok: false, error: { code: "repo_root_failed" } });
		expect(configReads).toEqual([]);
	});
});

function projectConfig(
	readResult: ReturnType<ProjectConfigGateway["readTextFile"]>,
	reads: string[] = [],
): ProjectConfigGateway {
	return {
		readTextFile(request) {
			reads.push(`${request.repoRoot}/${request.relativePath}`);
			return readResult;
		},
		pathExists: () => ({ type: "missing" }),
	};
}

function fakeApi(respond: (args: readonly string[]) => ExecResult): {
	api: NsExtensionApi;
	calls: ExecCall[];
} {
	const calls: ExecCall[] = [];
	return {
		api: {
			cwd: "/repo",
			env: {},
			commandIo: noopNsCommandIo,
			progress: noopNsProgress,
			renderCapabilities: { canEmitAnsi: false },
			hasExtension: () => false,
			textGenerator: {
				async generateText() {
					return { ok: false, error: "unexpected model call" };
				},
			},
			async exec(command, args, options) {
				calls.push({ command, args: [...args], ...(options === undefined ? {} : { options }) });
				return respond(args);
			},
		},
		calls,
	};
}

function exited(overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {}): ExecResult {
	return {
		type: "exited",
		stdout: "",
		stderr: "",
		code: 0,
		signal: null,
		...overrides,
	};
}
