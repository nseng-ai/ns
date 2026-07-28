import path from "node:path";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { expect, test } from "vitest";

import { createFilesystemSource } from "../../src/app/filesystem-source.ts";
import { composeSources } from "../../src/app/programmatic-source.ts";
import { ClinkrTopology } from "../../src/app/topology.ts";

const FIXTURE = path.join(import.meta.dirname, "../fixtures/recursive-topology");

interface ObservationsModule {
	readonly observations: {
		readonly groups: number[];
		readonly metadata: string[];
		readonly definitions: string[];
	};
}

async function observations() {
	const module: unknown = await import(path.join(FIXTURE, "observations.ts"));
	if (!isObservationsModule(module)) throw new Error("Malformed recursive topology observations");
	return module.observations;
}

test("filesystem scopes advance exactly one group depth and selected loading stays lazy", async () => {
	const source = createFilesystemSource({ commandDirectory: FIXTURE });
	const state = await observations();
	const before = {
		groups: state.groups.length,
		metadata: state.metadata.length,
		definitions: state.definitions.length,
	};
	for (let depth = 0; depth < 5; depth += 1) {
		await source.open(["one", "two", "three", "four", "five"].slice(0, depth));
		expect(state.groups.slice(before.groups)).toEqual(
			Array.from({ length: depth + 1 }, (_unused, index) => index + 1),
		);
		expect(state.metadata.length - before.metadata).toBe(0);
		expect(state.definitions.length - before.definitions).toBe(0);
	}
	const leafScope = await source.open(["one", "two", "three", "four", "five"]);
	expect(state.metadata.slice(before.metadata)).toEqual(["leaf"]);
	expect(state.definitions.length - before.definitions).toBe(0);
	await leafScope.commands.get("leaf")?.load();
	expect(state.definitions.slice(before.definitions)).toEqual(["leaf"]);
});

test("disjoint filesystem groups retain ownership and do not probe unrelated sources", async () => {
	const ownerDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-owner-"));
	const unrelatedDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-unrelated-"));
	try {
		const ownedDirectory = path.join(ownerDirectory, "owned");
		await mkdir(ownedDirectory);
		await writeFile(
			path.join(ownedDirectory, "group.ts"),
			'export function group() { return { description: "Owned." }; }\n',
		);
		const topology = new ClinkrTopology({
			sources: [
				createFilesystemSource({ commandDirectory: ownerDirectory, label: "owner" }),
				createFilesystemSource({ commandDirectory: unrelatedDirectory, label: "unrelated" }),
			],
		});
		await expect(topology.open(["owned"])).resolves.toEqual({
			commands: new Map(),
			groups: new Map(),
		});
	} finally {
		await Promise.all([
			rm(ownerDirectory, { recursive: true }),
			rm(unrelatedDirectory, { recursive: true }),
		]);
	}
});

test("filesystem/filesystem command collisions report class, path, and labels", async () => {
	const firstDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-first-"));
	const secondDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-second-"));
	try {
		for (const directory of [firstDirectory, secondDirectory]) {
			const sharedDirectory = path.join(directory, "shared");
			await mkdir(sharedDirectory);
			await Promise.all([
				writeFile(
					path.join(sharedDirectory, "metadata.ts"),
					'export function metadata() { return { description: "Shared." }; }\n',
				),
				writeFile(path.join(sharedDirectory, "command.ts"), "export async function command() {}\n"),
			]);
		}
		const topology = new ClinkrTopology({
			sources: [
				createFilesystemSource({ commandDirectory: secondDirectory, label: "filesystem-b" }),
				createFilesystemSource({ commandDirectory: firstDirectory, label: "filesystem-a" }),
			],
		});
		await expect(topology.open([])).rejects.toThrow(
			/command\/command collision at shared.*filesystem-a.*filesystem-b/,
		);
	} finally {
		await Promise.all([
			rm(firstDirectory, { recursive: true }),
			rm(secondDirectory, { recursive: true }),
		]);
	}
});

test("programmatic/filesystem collisions use the same classification", async () => {
	const directory = await mkdtemp(path.join(tmpdir(), "clinkr-filesystem-"));
	try {
		const sharedDirectory = path.join(directory, "shared");
		await mkdir(sharedDirectory);
		await writeFile(
			path.join(sharedDirectory, "group.ts"),
			'export function group() { return { description: "Filesystem group." }; }\n',
		);
		const programmatic = composeSources<never>((composition) => {
			composition.source({ label: "programmatic" }, (scope) => {
				scope.command("shared", { description: "Programmatic command." }, async () => {
					throw new Error("collision must not load definitions");
				});
			});
		});
		for (const reverse of [false, true]) {
			const filesystem = createFilesystemSource<never>({
				commandDirectory: directory,
				label: "filesystem",
			});
			const sources = reverse ? [filesystem, ...programmatic] : [...programmatic, filesystem];
			const topology = new ClinkrTopology({ sources });
			await expect(topology.open([])).rejects.toThrow(
				/command\/group collision at shared.*filesystem.*programmatic/,
			);
		}
	} finally {
		await rm(directory, { recursive: true });
	}
});

test("shared filesystem group paths are rejected with both owners", async () => {
	const firstDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-first-"));
	const secondDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-second-"));
	try {
		for (const directory of [firstDirectory, secondDirectory]) {
			const sharedDirectory = path.join(directory, "shared");
			await mkdir(sharedDirectory);
			await writeFile(
				path.join(sharedDirectory, "group.ts"),
				'export function group() { return { description: "Shared." }; }\n',
			);
		}
		const topology = new ClinkrTopology({
			sources: [
				createFilesystemSource({ commandDirectory: firstDirectory, label: "first" }),
				createFilesystemSource({ commandDirectory: secondDirectory, label: "second" }),
			],
		});
		await expect(topology.open([])).rejects.toThrow(/shared.*first.*second/);
	} finally {
		await Promise.all([
			rm(firstDirectory, { recursive: true }),
			rm(secondDirectory, { recursive: true }),
		]);
	}
});

test("declared siblings beside a scope.filesystem mount own missing descendant subtrees", async () => {
	const mountDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-mount-"));
	try {
		const realDirectory = path.join(mountDirectory, "real");
		await mkdir(realDirectory);
		await writeFile(
			path.join(realDirectory, "group.ts"),
			'export function group() { return { description: "Real." }; }\n',
		);
		const sources = composeSources<never>((composition) => {
			composition.source({ label: "mixed" }, (scope) => {
				scope.filesystem({ commandDirectory: mountDirectory });
				scope.group("api", { description: "Declared api." }, (api) => {
					api.command("list", { description: "List things." }, async () => {
						throw new Error("lazy command must not load during topology open");
					});
					api.group("nested", { description: "Declared nested." }, (nested) => {
						nested.command("show", { description: "Show things." }, async () => {
							throw new Error("lazy command must not load during topology open");
						});
					});
				});
			});
		});
		const topology = new ClinkrTopology({ sources });
		const root = await topology.open([]);
		expect([...root.groups.keys()].sort()).toEqual(["api", "real"]);
		const api = await topology.open(["api"]);
		expect([...api.commands.keys()]).toEqual(["list"]);
		expect([...api.groups.keys()]).toEqual(["nested"]);
		const nested = await topology.open(["api", "nested"]);
		expect([...nested.commands.keys()]).toEqual(["show"]);
	} finally {
		await rm(mountDirectory, { recursive: true });
	}
});

test("a present filesystem subtree still collides with a same-source declaration", async () => {
	const mountDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-mount-"));
	try {
		const apiDirectory = path.join(mountDirectory, "api");
		await mkdir(apiDirectory);
		await writeFile(
			path.join(apiDirectory, "group.ts"),
			'export function group() { return { description: "Filesystem api." }; }\n',
		);
		const sources = composeSources<never>((composition) => {
			composition.source({ label: "mixed" }, (scope) => {
				scope.filesystem({ commandDirectory: mountDirectory });
				scope.group("api", { description: "Declared api." }, () => {});
			});
		});
		const topology = new ClinkrTopology({ sources });
		await expect(topology.open([])).rejects.toThrow(/route collision at api within one source/);
	} finally {
		await rm(mountDirectory, { recursive: true });
	}
});

test("a missing mount root fails like a missing command directory", async () => {
	const parentDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-missing-"));
	try {
		const missingDirectory = path.join(parentDirectory, "absent-mount");
		const sources = composeSources<never>((composition) => {
			composition.source({ label: "mixed" }, (scope) => {
				scope.filesystem({ commandDirectory: missingDirectory });
				scope.group("api", { description: "Declared api." }, () => {});
			});
		});
		const topology = new ClinkrTopology({ sources });
		// A mistyped mount directory is the same misconfiguration as a mistyped
		// app commandDirectory and fails with the offending path.
		await expect(topology.open([])).rejects.toThrow(
			`clinkr: command directory does not exist: ${missingDirectory}`,
		);
	} finally {
		await rm(parentDirectory, { recursive: true });
	}
});

test("a non-directory child under a scope.filesystem mount is not treated as empty", async () => {
	const mountDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-mount-"));
	try {
		await writeFile(path.join(mountDirectory, "api"), "not a directory\n");
		const sources = composeSources<never>((composition) => {
			composition.source({ label: "mixed" }, (scope) => {
				scope.filesystem({ commandDirectory: mountDirectory });
				scope.group("api", { description: "Declared api." }, () => {});
			});
		});
		const topology = new ClinkrTopology({ sources });
		await expect(topology.open(["api"])).rejects.toThrow(/unable to open filesystem scope api at /);
	} finally {
		await rm(mountDirectory, { recursive: true });
	}
});

test("a missing command directory fails while missing child routes yield empty scopes", async () => {
	const existingDirectory = await mkdtemp(path.join(tmpdir(), "clinkr-auth-"));
	try {
		const missingRoot = path.join(existingDirectory, "never-created");
		const emptyScope = { commands: new Map(), groups: new Map() };
		await expect(
			createFilesystemSource({ commandDirectory: missingRoot }).open([]),
		).rejects.toThrow(`clinkr: command directory does not exist: ${missingRoot}`);
		await expect(
			createFilesystemSource({ commandDirectory: existingDirectory }).open(["absent"]),
		).resolves.toEqual(emptyScope);
	} finally {
		await rm(existingDirectory, { recursive: true });
	}
});

function isObservationsModule(value: unknown): value is ObservationsModule {
	if (typeof value !== "object" || value === null || !("observations" in value)) return false;
	const observations = value.observations;
	return (
		typeof observations === "object" &&
		observations !== null &&
		"groups" in observations &&
		Array.isArray(observations.groups) &&
		"metadata" in observations &&
		Array.isArray(observations.metadata) &&
		"definitions" in observations &&
		Array.isArray(observations.definitions)
	);
}
