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
		const child = await loadFilesystemChild<TContext>(entry.name, directory, routePath);
		if (child.kind === "empty") continue;
		if (child.kind === "group") {
			groups.set(entry.name, { definition: child.definition });
			continue;
		}
		commands.set(entry.name, child.command);
	}
	return { ...(defaultCommand === undefined ? {} : { defaultCommand }), commands, groups };
}

type LoadedFilesystemChild<TContext> =
	| { readonly kind: "empty" }
	| {
			readonly kind: "group";
			readonly definition: Awaited<ReturnType<typeof importGroupDefinition>>;
	  }
	| { readonly kind: "command"; readonly command: SourceCommand<TContext> };

async function loadFilesystemChild<TContext>(
	name: string,
	parentDirectory: string,
	parentPath: readonly string[],
): Promise<LoadedFilesystemChild<TContext>> {
	const routePath = [...parentPath, name];
	const directory = path.join(parentDirectory, name);
	const entries = await readdir(directory, { withFileTypes: true });
	const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
	validateTopologyFiles(files, directory, routePath);
	const hasMetadata = files.has("metadata.ts");
	if (hasMetadata !== files.has("command.ts")) {
		throw new Error(
			`clinkr: incomplete command pair at ${canonicalPath(routePath)} in ${directory}`,
		);
	}
	const hasGroup = files.has("group.ts");
	if (!hasGroup && !hasMetadata) return { kind: "empty" };
	validateRouteName(name, routePath);
	if (hasGroup) {
		const definition = await importGroupDefinition(path.join(directory, "group.ts"));
		validateGroupDefinition(definition, name, routePath);
		return { kind: "group", definition };
	}
	const metadata = await importCommandMetadata(path.join(directory, "metadata.ts"));
	validateCommandMetadata(metadata, name, routePath);
	return {
		kind: "command",
		command: {
			metadata,
			load: async () => importSelectedCommand<TContext>(directory, metadata),
		},
	};
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
