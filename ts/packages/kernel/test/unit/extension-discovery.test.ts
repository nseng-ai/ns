import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	discoverExtensionsInRoot,
	discoverSdlPackageCommands,
} from "../../src/extensions/discovery.ts";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-extension-discovery-"));
	tempDirs.push(directory);
	return directory;
}

function writeFile(path: string, content = "export default {}\n"): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("extension discovery", () => {
	test("discovers one-level files, directory indexes, and package command manifest entries", async () => {
		const root = await createTempDir();
		writeFile(join(root, "bare.ts"));
		writeFile(join(root, "plain.js"));
		writeFile(join(root, "types.d.ts"), "export interface Ignored {}\n");
		writeFile(join(root, "dir-ts", "index.ts"));
		writeFile(join(root, "dir-js", "index.js"));
		writeFile(
			join(root, "package-ext", "package.json"),
			JSON.stringify({
				ns: {
					commands: [{ name: "custom", description: "Custom command.", entry: "./src/index.ts" }],
				},
			}),
		);
		writeFile(join(root, "package-ext", "src", "index.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(
			result.commands.map((command) => [
				command.kind,
				command.name,
				command.description,
				command.entryPath,
			]),
		).toEqual([
			["file", "bare", "Run SDL command entry 'bare'.", join(root, "bare.ts")],
			["dir-index", "dir-js", "Run SDL command entry 'dir-js'.", join(root, "dir-js", "index.js")],
			["dir-index", "dir-ts", "Run SDL command entry 'dir-ts'.", join(root, "dir-ts", "index.ts")],
			["package", "custom", "Custom command.", join(root, "package-ext", "src", "index.ts")],
			["file", "plain", "Run SDL command entry 'plain'.", join(root, "plain.js")],
		]);
	});

	test("missing root is okay and file root is an error", async () => {
		const root = await createTempDir();
		const missing = join(root, "missing");
		expect(discoverExtensionsInRoot(missing)).toEqual({ commands: [], diagnostics: [] });

		const fileRoot = join(root, "not-dir.ts");
		writeFile(fileRoot);
		const result = discoverExtensionsInRoot(fileRoot);
		expect(result.commands).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({ code: "extension_root_not_directory" });
	});

	test("malformed package manifests produce structured diagnostics", async () => {
		const root = await createTempDir();
		writeFile(join(root, "bad-json", "package.json"), "{ nope");
		writeFile(join(root, "missing-ns", "package.json"), JSON.stringify({ name: "missing" }));
		writeFile(
			join(root, "bad-entries", "package.json"),
			JSON.stringify({
				ns: {
					commands: [
						"not-object",
						{ name: "Bad", description: "Bad.", entry: "./missing.ts" },
						{ name: "escape", description: "Escape.", entry: "../escape.ts" },
						{ name: "abs", description: "Abs.", entry: "/abs.ts" },
						{ name: "types", description: "Types.", entry: "./types.d.ts" },
						{ name: "missing-description", entry: "./missing.ts" },
					],
				},
			}),
		);

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"extension_manifest_command_invalid",
			"extension_manifest_command_name_invalid",
			"extension_manifest_entry_missing",
			"extension_manifest_entry_escapes",
			"extension_manifest_entry_not_relative",
			"extension_manifest_entry_unsupported",
			"extension_manifest_command_description_missing",
			"extension_manifest_entry_missing",
			"extension_manifest_parse_failed",
			"extension_manifest_missing_ns",
		]);
	});

	test("invalid package-level group suppresses manifest commands", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "bad-group", "package.json"),
			JSON.stringify({
				ns: {
					group: "Bad",
					commands: [{ name: "hello", description: "Hello.", entry: "./src/hello.ts" }],
				},
			}),
		);
		writeFile(join(root, "bad-group", "src", "hello.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			code: "extension_manifest_command_group_invalid",
		});
		expect(result.diagnostics[0]?.commandName).toBeUndefined();
	});

	test("package-level groups apply to manifest commands", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "handoff", "package.json"),
			JSON.stringify({
				ns: {
					group: "handoff",
					commands: [{ name: "list", description: "List handoffs.", entry: "./src/list.ts" }],
				},
			}),
		);
		writeFile(join(root, "handoff", "src", "list.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(result.commands).toEqual([
			expect.objectContaining({
				group: "handoff",
				name: "list",
				description: "List handoffs.",
				fullDescription: "List handoffs.",
			}),
		]);
	});

	test("manifest path entries may include compatibility names", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "roaster", "package.json"),
			JSON.stringify({
				ns: {
					group: "roaster",
					commands: [
						{
							name: "review-list",
							path: ["review", "list"],
							description: "List Roaster reviews.",
							entry: "./src/review-list.ts",
						},
						{
							path: ["review", "show"],
							description: "Show a Roaster review.",
							entry: "./src/review-show.ts",
						},
					],
				},
			}),
		);
		writeFile(join(root, "roaster", "src", "review-list.ts"));
		writeFile(join(root, "roaster", "src", "review-show.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(result.commands).toEqual([
			expect.objectContaining({
				group: "roaster",
				name: "review-list",
				segments: ["roaster", "review", "list"],
			}),
			expect.objectContaining({
				group: "roaster",
				name: "show",
				segments: ["roaster", "review", "show"],
			}),
		]);
	});

	test("manifest entry groups override the package-level group", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "handoff", "package.json"),
			JSON.stringify({
				ns: {
					group: "handoff",
					commands: [
						{
							name: "exec-clear",
							description: "Clear state.",
							group: "handoff-exec",
							entry: "./src/exec-clear.ts",
						},
					],
				},
			}),
		);
		writeFile(join(root, "handoff", "src", "exec-clear.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(result.commands).toEqual([
			expect.objectContaining({
				group: "handoff-exec",
				name: "exec-clear",
			}),
		]);
	});

	test("manifest sdl.commands must be an array", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "bad", "package.json"),
			JSON.stringify({ ns: { extensions: ["./src/index.ts"] } }),
		);

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({ code: "extension_manifest_commands_not_array" });
		expect(result.diagnostics[0]?.commandName).toBeUndefined();
	});

	test("manifest structure diagnostics are classified from shared schema issues", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "bad-commands", "package.json"),
			JSON.stringify({ ns: { commands: "./src/index.ts" } }),
		);
		writeFile(join(root, "bad-sdl", "package.json"), JSON.stringify({ ns: "commands" }));

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"extension_manifest_commands_not_array",
			"extension_manifest_missing_ns",
		]);
	});

	test("bulk SDL package discovery suppresses manifest structure diagnostics", async () => {
		const root = await createTempDir();
		const packageDir = join(root, "ordinary-package");
		writeFile(join(packageDir, "package.json"), JSON.stringify({ ns: "commands" }));

		const result = discoverSdlPackageCommands(root, packageDir);

		expect(result).toEqual({ commands: [], diagnostics: [] });
	});

	test("unknown package manifest fields do not break command discovery", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "flow", "package.json"),
			JSON.stringify({
				private: true,
				ns: {
					group: "flow",
					owner: "repo-local",
					commands: [
						{
							name: "changes",
							description: "Show changes.",
							entry: "./src/changes.ts",
							futureField: "accepted",
						},
					],
				},
			}),
		);
		writeFile(join(root, "flow", "src", "changes.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(result.commands).toEqual([expect.objectContaining({ group: "flow", name: "changes" })]);
	});

	test("manifest command entry diagnostics include commandName when the entry has a name", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "bad", "package.json"),
			JSON.stringify({
				ns: { commands: [{ name: "hello", description: "Hello.", entry: "./missing.ts" }] },
			}),
		);

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({
			code: "extension_manifest_entry_missing",
			commandName: "hello",
		});
	});

	test("invalid fullDescription keeps its distinct manifest diagnostic", async () => {
		const root = await createTempDir();
		writeFile(
			join(root, "bad", "package.json"),
			JSON.stringify({
				ns: {
					commands: [
						{
							name: "hello",
							description: "Hello.",
							fullDescription: "",
							entry: "./src/hello.ts",
						},
					],
				},
			}),
		);
		writeFile(join(root, "bad", "src", "hello.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: "extension_manifest_command_full_description_invalid",
				commandName: "hello",
			}),
		]);
	});

	test("direct entries with invalid inferred command names are malformed", async () => {
		const root = await createTempDir();
		writeFile(join(root, "Bad.ts"));
		writeFile(join(root, "bad_name", "index.ts"));

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			"extension_command_name_invalid",
			"extension_command_name_invalid",
		]);
	});

	test("directory index discovery prefers index.ts over index.js", async () => {
		const root = await createTempDir();
		writeFile(join(root, "both", "index.ts"));
		writeFile(join(root, "both", "index.js"));

		const result = discoverExtensionsInRoot(root);

		expect(result.diagnostics).toEqual([]);
		expect(result.commands).toEqual([
			expect.objectContaining({
				kind: "dir-index",
				name: "both",
				entryPath: join(root, "both", "index.ts"),
			}),
		]);
	});

	test("directory without index or manifest is malformed", async () => {
		const root = await createTempDir();
		mkdirSync(join(root, "empty"), { recursive: true });

		const result = discoverExtensionsInRoot(root);

		expect(result.commands).toEqual([]);
		expect(result.diagnostics[0]).toMatchObject({ code: "extension_directory_missing_entry" });
	});
});
