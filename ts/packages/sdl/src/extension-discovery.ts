import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

import { SDL_COMMAND_NAME_PATTERN, SDL_COMMAND_NAME_RULE, formatUnknownError } from "./command-registry.ts";

export type DiscoveredExtensionCommandKind = "file" | "dir-index" | "package";

export interface DiscoveredExtensionCommand {
	name: string;
	description: string;
	fullDescription: string;
	entryPath: string;
	displayPath: string;
	kind: DiscoveredExtensionCommandKind;
}

export interface ExtensionDiscoveryDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path?: string | undefined;
	commandName?: string | undefined;
}

export interface ExtensionDiscoveryResult {
	commands: readonly DiscoveredExtensionCommand[];
	diagnostics: readonly ExtensionDiscoveryDiagnostic[];
}

export function discoverExtensionsInRoot(rootDir: string): ExtensionDiscoveryResult {
	if (!existsSync(rootDir)) return { commands: [], diagnostics: [] };

	let rootStat;
	try {
		rootStat = statSync(rootDir);
	} catch (error) {
		return { commands: [], diagnostics: [diagnostic("extension_root_stat_failed", `Could not inspect extension root ${rootDir}.\n${formatUnknownError(error)}`, { path: rootDir })] };
	}
	if (!rootStat.isDirectory()) {
		return { commands: [], diagnostics: [diagnostic("extension_root_not_directory", `Extension root must be a directory: ${rootDir}.`, { path: rootDir })] };
	}

	let entries;
	try {
		entries = readdirSync(rootDir, { withFileTypes: true });
	} catch (error) {
		return { commands: [], diagnostics: [diagnostic("extension_root_read_failed", `Could not read extension root ${rootDir}.\n${formatUnknownError(error)}`, { path: rootDir })] };
	}

	const commands: DiscoveredExtensionCommand[] = [];
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const entryPath = join(rootDir, entry.name);
		if (entry.isFile()) {
			if (isLoadableExtensionFile(entry.name)) {
				const command = commandForDirectEntry({ kind: "file", name: basename(entry.name, extname(entry.name)), entryPath, rootDir });
				if (command.ok) commands.push(command.command);
				else diagnostics.push(command.diagnostic);
			}
			continue;
		}
		if (!entry.isDirectory()) continue;

		const packageJsonPath = join(entryPath, "package.json");
		if (existsSync(packageJsonPath)) {
			const packageResult = discoverPackageCommands(rootDir, entryPath, packageJsonPath);
			commands.push(...packageResult.commands);
			diagnostics.push(...packageResult.diagnostics);
			continue;
		}

		const indexTs = join(entryPath, "index.ts");
		const indexJs = join(entryPath, "index.js");
		if (existsSync(indexTs)) {
			const command = commandForDirectEntry({ kind: "dir-index", name: entry.name, entryPath: indexTs, rootDir });
			if (command.ok) commands.push(command.command);
			else diagnostics.push(command.diagnostic);
			continue;
		}
		if (existsSync(indexJs)) {
			const command = commandForDirectEntry({ kind: "dir-index", name: entry.name, entryPath: indexJs, rootDir });
			if (command.ok) commands.push(command.command);
			else diagnostics.push(command.diagnostic);
			continue;
		}
		diagnostics.push(diagnostic("extension_directory_missing_entry", `Extension directory must contain package.json, index.ts, or index.js: ${entryPath}.`, { path: entryPath, commandName: entry.name }));
	}

	return {
		commands: commands.sort((left, right) => left.displayPath.localeCompare(right.displayPath)),
		diagnostics,
	};
}

function discoverPackageCommands(rootDir: string, packageDir: string, packageJsonPath: string): ExtensionDiscoveryResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return { commands: [], diagnostics: [diagnostic("extension_manifest_parse_failed", `Could not parse extension manifest ${packageJsonPath}.\n${formatUnknownError(error)}`, { path: packageJsonPath })] };
	}

	if (!isRecord(parsed) || !isRecord(parsed.asdl)) {
		return { commands: [], diagnostics: [diagnostic("extension_manifest_missing_asdl", `Extension manifest must contain an asdl object: ${packageJsonPath}.`, { path: packageJsonPath })] };
	}
	const entries = parsed.asdl.commands;
	if (!Array.isArray(entries)) {
		return { commands: [], diagnostics: [diagnostic("extension_manifest_commands_not_array", `Extension manifest asdl.commands must be an array: ${packageJsonPath}.`, { path: packageJsonPath })] };
	}

	const commands: DiscoveredExtensionCommand[] = [];
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	for (const entry of entries) {
		const command = commandForManifestEntry({ rootDir, packageDir, packageJsonPath, entry });
		if (command.ok) {
			commands.push(command.command);
		} else {
			diagnostics.push(...command.diagnostics);
		}
	}
	return { commands, diagnostics };
}

function commandForDirectEntry(options: {
	kind: "file" | "dir-index";
	name: string;
	entryPath: string;
	rootDir: string;
}): { ok: true; command: DiscoveredExtensionCommand } | { ok: false; diagnostic: ExtensionDiscoveryDiagnostic } {
	if (!SDL_COMMAND_NAME_PATTERN.test(options.name)) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_command_name_invalid",
				`SDL command entry name inferred from ${options.entryPath} must match ${SDL_COMMAND_NAME_RULE}.`,
				{ path: options.entryPath, commandName: options.name },
			),
		};
	}
	return { ok: true, command: buildCommand(options) };
}

function commandForManifestEntry(options: {
	rootDir: string;
	packageDir: string;
	packageJsonPath: string;
	entry: unknown;
}): { ok: true; command: DiscoveredExtensionCommand } | { ok: false; diagnostics: readonly ExtensionDiscoveryDiagnostic[] } {
	if (!isRecord(options.entry)) {
		return { ok: false, diagnostics: [diagnostic("extension_manifest_command_invalid", `Extension manifest commands must be objects: ${options.packageJsonPath}.`, { path: options.packageJsonPath })] };
	}
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	const commandName = typeof options.entry.name === "string" && options.entry.name.trim() !== "" ? options.entry.name : undefined;
	const name = readRequiredString({ value: options.entry.name, field: "name", code: "extension_manifest_command_name_missing", packageJsonPath: options.packageJsonPath, commandName });
	const description = readRequiredString({
		value: options.entry.description,
		field: "description",
		code: "extension_manifest_command_description_missing",
		packageJsonPath: options.packageJsonPath,
		commandName,
	});
	const rawEntryPath = readRequiredString({ value: options.entry.entry, field: "entry", code: "extension_manifest_command_entry_missing", packageJsonPath: options.packageJsonPath, commandName });
	const fullDescription =
		options.entry.fullDescription === undefined
			? description
			: readRequiredString({
					value: options.entry.fullDescription,
					field: "fullDescription",
					code: "extension_manifest_command_full_description_invalid",
					packageJsonPath: options.packageJsonPath,
					commandName,
				});
	const requiredResults = options.entry.fullDescription === undefined ? [name, description, rawEntryPath] : [name, description, rawEntryPath, fullDescription];
	for (const result of requiredResults) {
		if (result.diagnostic !== undefined) diagnostics.push(result.diagnostic);
	}

	if (name.value !== undefined && !SDL_COMMAND_NAME_PATTERN.test(name.value)) {
		diagnostics.push(diagnostic("extension_manifest_command_name_invalid", `Extension manifest command name must match ${SDL_COMMAND_NAME_RULE}: ${name.value}.`, { path: options.packageJsonPath, commandName }));
	}

	let entryPath: string | undefined;
	if (rawEntryPath.value !== undefined) {
		const entryPathValidation = validateManifestEntryPath({
			packageDir: options.packageDir,
			packageJsonPath: options.packageJsonPath,
			rawEntryPath: rawEntryPath.value,
			commandName,
		});
		if (entryPathValidation.ok) {
			entryPath = entryPathValidation.entryPath;
		} else {
			diagnostics.push(...entryPathValidation.diagnostics);
		}
	}

	if (diagnostics.length > 0 || name.value === undefined || description.value === undefined || fullDescription.value === undefined || entryPath === undefined) {
		return { ok: false, diagnostics };
	}

	const displayPath = relativeDisplayPath(options.rootDir, entryPath);
	return {
		ok: true,
		command: {
			kind: "package",
			name: name.value,
			description: description.value,
			fullDescription: fullDescription.value,
			entryPath,
			displayPath,
		},
	};
}

function validateManifestEntryPath(options: {
	packageDir: string;
	packageJsonPath: string;
	rawEntryPath: string;
	commandName: string | undefined;
}): { ok: true; entryPath: string } | { ok: false; diagnostics: readonly ExtensionDiscoveryDiagnostic[] } {
	if (options.rawEntryPath.startsWith("/") || options.rawEntryPath.includes("\\")) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("extension_manifest_entry_not_relative", `Extension manifest command entry must be a relative POSIX-style path inside the package: ${options.rawEntryPath}.`, {
					path: options.packageJsonPath,
					commandName: options.commandName,
				}),
			],
		};
	}

	const resolvedEntry = resolve(options.packageDir, options.rawEntryPath);
	if (!isInsideDirectory(options.packageDir, resolvedEntry)) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("extension_manifest_entry_escapes", `Extension manifest command entry must not escape its package directory: ${options.rawEntryPath}.`, {
					path: options.packageJsonPath,
					commandName: options.commandName,
				}),
			],
		};
	}
	if (!isLoadableExtensionFile(basename(resolvedEntry))) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("extension_manifest_entry_unsupported", `Extension manifest command entry must be a .ts or .js file, excluding .d.ts: ${options.rawEntryPath}.`, {
					path: options.packageJsonPath,
					commandName: options.commandName,
				}),
			],
		};
	}

	let entryStat;
	try {
		entryStat = statSync(resolvedEntry);
	} catch {
		return {
			ok: false,
			diagnostics: [
				diagnostic("extension_manifest_entry_missing", `Extension manifest command entry does not exist: ${options.rawEntryPath}.`, {
					path: options.packageJsonPath,
					commandName: options.commandName,
				}),
			],
		};
	}
	if (!entryStat.isFile()) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("extension_manifest_entry_not_file", `Extension manifest command entry must be a file: ${options.rawEntryPath}.`, {
					path: options.packageJsonPath,
					commandName: options.commandName,
				}),
			],
		};
	}
	return { ok: true, entryPath: resolvedEntry };
}

function readRequiredString(options: {
	value: unknown;
	field: string;
	code: string;
	packageJsonPath: string;
	commandName?: string | undefined;
}): { value: string | undefined; diagnostic?: ExtensionDiscoveryDiagnostic } {
	if (typeof options.value === "string" && options.value.trim() !== "") return { value: options.value };
	return {
		value: undefined,
		diagnostic: diagnostic(options.code, `Extension manifest command ${options.field} must be a non-empty string: ${options.packageJsonPath}.`, {
			path: options.packageJsonPath,
			commandName: options.commandName,
		}),
	};
}

function buildCommand(options: {
	kind: "file" | "dir-index";
	name: string;
	entryPath: string;
	rootDir: string;
}): DiscoveredExtensionCommand {
	const description = `Run SDL command entry '${options.name}'.`;
	return {
		kind: options.kind,
		name: options.name,
		description,
		fullDescription: description,
		entryPath: options.entryPath,
		displayPath: relativeDisplayPath(options.rootDir, options.entryPath),
	};
}

function isLoadableExtensionFile(name: string): boolean {
	if (name.endsWith(".d.ts")) return false;
	const extension = extname(name);
	return extension === ".ts" || extension === ".js";
}

function isInsideDirectory(parent: string, child: string): boolean {
	const relativePath = relative(parent, child);
	return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("/") && !relativePath.startsWith("\\"));
}

function relativeDisplayPath(rootDir: string, entryPath: string): string {
	return join(basename(rootDir), relative(rootDir, entryPath));
}

function diagnostic(code: string, message: string, options: { path?: string | undefined; commandName?: string | undefined } = {}): ExtensionDiscoveryDiagnostic {
	return { severity: "error", code, message, ...(options.path === undefined ? {} : { path: options.path }), ...(options.commandName === undefined ? {} : { commandName: options.commandName }) };
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

