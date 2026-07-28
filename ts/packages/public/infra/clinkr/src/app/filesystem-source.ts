import { readdir } from "node:fs/promises";
import path from "node:path";

import {
	importCommandMetadata,
	importGroupDefinition,
	importSelectedCommand,
} from "./selected-command.ts";
import {
	canonicalPath,
	type SourceCommand,
	type SourceScope,
	type TopologySource,
	validateCommandMetadata,
	validateGroupDefinition,
	validateRouteName,
	validateSourceLabel,
} from "./topology.ts";

interface FilesystemSourceOptions {
	readonly commandDirectory: string;
	readonly label?: string;
}

export function createFilesystemSource<TContext>(
	options: FilesystemSourceOptions,
): TopologySource<TContext> {
	if (!path.isAbsolute(options.commandDirectory)) {
		throw new Error("clinkr: commandDirectory must be absolute");
	}
	const label = options.label ?? options.commandDirectory;
	validateSourceLabel(label);
	return {
		label,
		open: async (routePath) => openFilesystemScope<TContext>(options.commandDirectory, routePath),
	};
}

async function openFilesystemScope<TContext>(
	rootDirectory: string,
	routePath: readonly string[],
): Promise<SourceScope<TContext>> {
	const directory = path.join(rootDirectory, ...routePath);
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		// A missing directory means the filesystem contributes nothing at this
		// route. Topology integrity (e.g. a mistyped commandDirectory) is a
		// consumer test-suite concern, not a runtime check. Present-but-broken
		// trees (ENOTDIR, permissions, malformed topology) remain fatal below.
		if (isMissingEntryError(error)) {
			return { commands: new Map(), groups: new Map() };
		}
		throw new Error(
			`clinkr: unable to open filesystem scope ${canonicalPath(routePath)} at ${directory}`,
			{ cause: error },
		);
	}
	const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
	validateTopologyFiles(files, directory, routePath);
	const hasMetadata = files.has("metadata.ts");
	const hasCommand = files.has("command.ts");
	const hasGroup = files.has("group.ts");
	if (hasMetadata !== hasCommand) {
		throw new Error(
			`clinkr: incomplete command pair at ${canonicalPath(routePath)} in ${directory}`,
		);
	}
	if (routePath.length === 0 && hasGroup) {
		throw new Error(`clinkr: malformed root group.ts at ${directory}`);
	}
	let defaultCommand: SourceCommand<TContext> | undefined;
	if (hasMetadata) {
		const metadataPath = path.join(directory, "metadata.ts");
		const metadata = await importCommandMetadata(metadataPath);
		validateCommandMetadata(metadata, routePath.at(-1), routePath);
		defaultCommand = {
			metadata,
			load: async () => importSelectedCommand<TContext>(directory, metadata),
		};
	}
	const commands = new Map<string, SourceCommand<TContext>>();
	const groups = new Map<
		string,
		{ readonly definition: Awaited<ReturnType<typeof importGroupDefinition>> }
	>();
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const name = entry.name;
		const childPath = [...routePath, name];
		const childDirectory = path.join(directory, name);
		const childEntries = await readdir(childDirectory, { withFileTypes: true });
		const childFiles = new Set(
			childEntries.filter((child) => child.isFile()).map((child) => child.name),
		);
		validateTopologyFiles(childFiles, childDirectory, childPath);
		const childHasMetadata = childFiles.has("metadata.ts");
		const childHasCommand = childFiles.has("command.ts");
		const childHasGroup = childFiles.has("group.ts");
		if (childHasMetadata !== childHasCommand) {
			throw new Error(
				`clinkr: incomplete command pair at ${canonicalPath(childPath)} in ${childDirectory}`,
			);
		}
		if (!childHasGroup && !childHasMetadata) continue;
		validateRouteName(name, childPath);
		if (childHasGroup) {
			const groupPath = path.join(childDirectory, "group.ts");
			const definition = await importGroupDefinition(groupPath);
			validateGroupDefinition(definition, name, childPath);
			groups.set(name, { definition });
			continue;
		}
		const metadataPath = path.join(childDirectory, "metadata.ts");
		const metadata = await importCommandMetadata(metadataPath);
		validateCommandMetadata(metadata, name, childPath);
		commands.set(name, {
			metadata,
			load: async () => importSelectedCommand<TContext>(childDirectory, metadata),
		});
	}
	return { ...(defaultCommand === undefined ? {} : { defaultCommand }), commands, groups };
}

function isMissingEntryError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

const TOPOLOGY_FILE_STEMS = new Set(["command", "group", "metadata"]);

function validateTopologyFiles(
	files: ReadonlySet<string>,
	directory: string,
	routePath: readonly string[],
): void {
	for (const file of files) {
		if (file === "command.ts" || file === "group.ts" || file === "metadata.ts") continue;
		const extensionIndex = file.indexOf(".");
		const stem = extensionIndex === -1 ? file : file.slice(0, extensionIndex);
		if (!TOPOLOGY_FILE_STEMS.has(stem)) continue;
		throw new Error(
			`clinkr: unsupported topology file ${file} at ${canonicalPath(routePath)} in ${directory}`,
		);
	}
}
