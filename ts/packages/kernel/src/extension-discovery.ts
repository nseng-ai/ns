import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

import {
	isPathInside,
	optionalEntries,
	optionalEntry,
	type ZodIssueLike,
} from "@sdl/core/primitives";
import {
	sdlExtensionManifestCommandSchema,
	sdlExtensionPackageManifestSchema,
	type SdlExtensionManifestCommand,
	type SdlExtensionPackageManifest,
} from "sdl-sdk";

import {
	SDL_COMMAND_NAME_PATTERN,
	SDL_COMMAND_NAME_RULE,
	commandLeafName,
	formatUnknownError,
	type SdlCommandCandidate,
} from "./command-registry.ts";
import { classifyFirstMatchingZodIssuePath, type ZodIssuePathRule } from "./zod-issue-path.ts";

export type DiscoveredExtensionCommandKind = "file" | "dir-index" | "package";

export interface DiscoveredExtensionCommand extends Pick<
	SdlCommandCandidate,
	| "group"
	| "name"
	| "segments"
	| "groupDescription"
	| "description"
	| "fullDescription"
	| "entryPath"
> {
	entryPath: string;
	displayPath: string;
	kind: DiscoveredExtensionCommandKind;
}

export interface ExtensionDiscoveryDiagnostic {
	severity: "error";
	code: string;
	message: string;
	path?: string;
	commandName?: string;
}

export interface ExtensionDiscoveryResult {
	commands: readonly DiscoveredExtensionCommand[];
	diagnostics: readonly ExtensionDiscoveryDiagnostic[];
}

interface ParsedManifestCommandEntryFields {
	group: string | undefined;
	name: string | undefined;
	segments: readonly string[] | undefined;
	groupDescription?: string;
	description: string | undefined;
	entry: string | undefined;
	fullDescription: string | undefined;
}

type RequiredManifestCommandStringField = "description" | "entry";

const requiredManifestCommandStringFields = [
	{
		field: "description",
		code: "extension_manifest_command_description_missing",
	},
	{
		field: "entry",
		code: "extension_manifest_command_entry_missing",
	},
] as const satisfies readonly {
	field: RequiredManifestCommandStringField;
	code: string;
}[];

type ManifestStructureIssueKind = "missing-sdl" | "commands-not-array" | "other";

const manifestStructureIssueRules: readonly ZodIssuePathRule<ManifestStructureIssueKind>[] = [
	{ pattern: [], match: "exact", value: "missing-sdl" },
	{ pattern: ["sdl"], match: "exact", value: "missing-sdl" },
	{ pattern: ["sdl", "commands"], match: "prefix", value: "commands-not-array" },
];

type PackageManifestParseResult =
	| { outcome: "ok"; manifest: SdlExtensionPackageManifest }
	| { outcome: "parse-failed"; diagnostic: ExtensionDiscoveryDiagnostic }
	| { outcome: "schema-failed"; issues: readonly ZodIssueLike[] };

type PackageManifestDiscoveryResolution =
	| { outcome: "ok"; manifest: SdlExtensionPackageManifest }
	| { outcome: "unavailable"; result: ExtensionDiscoveryResult };

export function discoverExtensionsInRoot(rootDir: string): ExtensionDiscoveryResult {
	if (!existsSync(rootDir)) return { commands: [], diagnostics: [] };

	let rootStat;
	try {
		rootStat = statSync(rootDir);
	} catch (error) {
		return {
			commands: [],
			diagnostics: [
				diagnostic(
					"extension_root_stat_failed",
					`Could not inspect extension root ${rootDir}.\n${formatUnknownError(error)}`,
					{ path: rootDir },
				),
			],
		};
	}
	if (!rootStat.isDirectory()) {
		return {
			commands: [],
			diagnostics: [
				diagnostic(
					"extension_root_not_directory",
					`Extension root must be a directory: ${rootDir}.`,
					{ path: rootDir },
				),
			],
		};
	}

	let entries;
	try {
		entries = readdirSync(rootDir, { withFileTypes: true });
	} catch (error) {
		return {
			commands: [],
			diagnostics: [
				diagnostic(
					"extension_root_read_failed",
					`Could not read extension root ${rootDir}.\n${formatUnknownError(error)}`,
					{ path: rootDir },
				),
			],
		};
	}

	const commands: DiscoveredExtensionCommand[] = [];
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const entryPath = join(rootDir, entry.name);
		if (entry.isFile()) {
			if (isLoadableExtensionFile(entry.name)) {
				const command = commandForDirectEntry({
					kind: "file",
					name: basename(entry.name, extname(entry.name)),
					entryPath,
					rootDir,
				});
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

		const indexPath = firstExistingDirectoryIndex(entryPath);
		if (indexPath !== undefined) {
			const command = commandForDirectEntry({
				kind: "dir-index",
				name: entry.name,
				entryPath: indexPath,
				rootDir,
			});
			if (command.ok) commands.push(command.command);
			else diagnostics.push(command.diagnostic);
			continue;
		}
		diagnostics.push(
			diagnostic(
				"extension_directory_missing_entry",
				`Extension directory must contain package.json, index.ts, or index.js: ${entryPath}.`,
				{ path: entryPath, commandName: entry.name },
			),
		);
	}

	return {
		commands: commands.sort((left, right) =>
			commandSortKey(left).localeCompare(commandSortKey(right)),
		),
		diagnostics,
	};
}

export function discoverSdlPackageCommands(
	rootDir: string,
	packageDir: string,
): ExtensionDiscoveryResult {
	const packageJsonPath = join(packageDir, "package.json");
	if (!existsSync(packageJsonPath)) return { commands: [], diagnostics: [] };

	const resolution = resolvePackageManifest(packageJsonPath, () => ({
		commands: [],
		diagnostics: [],
	}));
	if (resolution.outcome === "unavailable") return resolution.result;
	if (resolution.manifest.sdl?.commands === undefined) return { commands: [], diagnostics: [] };
	return discoverPackageCommands(rootDir, packageDir, packageJsonPath, resolution.manifest);
}

function readPackageManifest(packageJsonPath: string): PackageManifestParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
	} catch (error) {
		return {
			outcome: "parse-failed",
			diagnostic: diagnostic(
				"extension_manifest_parse_failed",
				`Could not parse extension manifest ${packageJsonPath}.\n${formatUnknownError(error)}`,
				{ path: packageJsonPath },
			),
		};
	}
	const manifestResult = sdlExtensionPackageManifestSchema.safeParse(parsed);
	if (!manifestResult.success) {
		return { outcome: "schema-failed", issues: manifestResult.error.issues };
	}
	return { outcome: "ok", manifest: manifestResult.data };
}

function resolvePackageManifest(
	packageJsonPath: string,
	onSchemaFailed: (issues: readonly ZodIssueLike[]) => ExtensionDiscoveryResult,
): PackageManifestDiscoveryResolution {
	const parseResult = readPackageManifest(packageJsonPath);
	if (parseResult.outcome === "parse-failed") {
		return {
			outcome: "unavailable",
			result: manifestReadFailureResult(parseResult.diagnostic),
		};
	}
	if (parseResult.outcome === "schema-failed") {
		return {
			outcome: "unavailable",
			result: onSchemaFailed(parseResult.issues),
		};
	}
	return { outcome: "ok", manifest: parseResult.manifest };
}

function manifestReadFailureResult(
	diagnostic: ExtensionDiscoveryDiagnostic,
): ExtensionDiscoveryResult {
	return { commands: [], diagnostics: [diagnostic] };
}

function discoverPackageCommands(
	rootDir: string,
	packageDir: string,
	packageJsonPath: string,
	parsedManifest?: SdlExtensionPackageManifest,
): ExtensionDiscoveryResult {
	let manifest: SdlExtensionPackageManifest;
	if (parsedManifest === undefined) {
		const resolution = resolvePackageManifest(packageJsonPath, (issues) => ({
			commands: [],
			diagnostics: [manifestStructureDiagnostic(issues, packageJsonPath)],
		}));
		if (resolution.outcome === "unavailable") return resolution.result;
		manifest = resolution.manifest;
	} else {
		manifest = parsedManifest;
	}

	if (manifest.sdl === undefined) {
		return {
			commands: [],
			diagnostics: [missingSdlDiagnostic(packageJsonPath)],
		};
	}
	const packageGroup = readNonEmptyString(manifest.sdl.group);
	const packageGroupDescription =
		readNonEmptyString(manifest.sdl.description) ?? readNonEmptyString(manifest.description);
	const packageGroupDiagnostic = groupDiagnostic({
		group: manifest.sdl.group,
		packageJsonPath,
		commandName: undefined,
	});
	if (packageGroupDiagnostic !== undefined) {
		return { commands: [], diagnostics: [packageGroupDiagnostic] };
	}
	const entries = manifest.sdl.commands;
	if (!Array.isArray(entries)) {
		return {
			commands: [],
			diagnostics: [commandsNotArrayDiagnostic(packageJsonPath)],
		};
	}

	const commands: DiscoveredExtensionCommand[] = [];
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	for (const entry of entries) {
		const command = commandForManifestEntry({
			rootDir,
			packageDir,
			packageJsonPath,
			packageGroup,
			packageGroupDescription,
			entry,
		});
		if (command.ok) {
			commands.push(command.command);
		} else {
			diagnostics.push(...command.diagnostics);
		}
	}
	return { commands, diagnostics };
}

function manifestStructureDiagnostic(
	issues: readonly ZodIssueLike[],
	packageJsonPath: string,
): ExtensionDiscoveryDiagnostic {
	const kind = classifyFirstMatchingZodIssuePath(issues, manifestStructureIssueRules, "other");
	if (kind === "missing-sdl") return missingSdlDiagnostic(packageJsonPath);
	if (kind === "commands-not-array") return commandsNotArrayDiagnostic(packageJsonPath);
	return diagnostic(
		"extension_manifest_invalid",
		`Extension manifest contains invalid SDL metadata: ${packageJsonPath}.`,
		{ path: packageJsonPath },
	);
}

function missingSdlDiagnostic(packageJsonPath: string): ExtensionDiscoveryDiagnostic {
	return diagnostic(
		"extension_manifest_missing_sdl",
		`Extension manifest must contain an sdl object: ${packageJsonPath}.`,
		{ path: packageJsonPath },
	);
}

function commandsNotArrayDiagnostic(packageJsonPath: string): ExtensionDiscoveryDiagnostic {
	return diagnostic(
		"extension_manifest_commands_not_array",
		`Extension manifest sdl.commands must be an array: ${packageJsonPath}.`,
		{ path: packageJsonPath },
	);
}

function firstExistingDirectoryIndex(entryPath: string): string | undefined {
	for (const indexFileName of ["index.ts", "index.js"] as const) {
		const indexPath = join(entryPath, indexFileName);
		if (existsSync(indexPath)) return indexPath;
	}
	return undefined;
}

function commandForDirectEntry(options: {
	kind: "file" | "dir-index";
	name: string;
	entryPath: string;
	rootDir: string;
}):
	| { ok: true; command: DiscoveredExtensionCommand }
	| { ok: false; diagnostic: ExtensionDiscoveryDiagnostic } {
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
	packageGroup: string | undefined;
	packageGroupDescription: string | undefined;
	entry: unknown;
}):
	| { ok: true; command: DiscoveredExtensionCommand }
	| { ok: false; diagnostics: readonly ExtensionDiscoveryDiagnostic[] } {
	const entryResult = sdlExtensionManifestCommandSchema.safeParse(options.entry);
	if (!entryResult.success) {
		return {
			ok: false,
			diagnostics: [
				diagnostic(
					"extension_manifest_command_invalid",
					`Extension manifest commands must be objects with supported known fields: ${options.packageJsonPath}.`,
					{ path: options.packageJsonPath },
				),
			],
		};
	}
	const parsedEntry = parseManifestCommandEntry({
		entry: entryResult.data,
		packageGroup: options.packageGroup,
		packageGroupDescription: options.packageGroupDescription,
		packageJsonPath: options.packageJsonPath,
	});
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [...parsedEntry.diagnostics];
	const commandName = parsedEntry.commandName;

	if (
		parsedEntry.entry.name !== undefined &&
		!SDL_COMMAND_NAME_PATTERN.test(parsedEntry.entry.name)
	) {
		diagnostics.push(
			diagnostic(
				"extension_manifest_command_name_invalid",
				`Extension manifest command name must match ${SDL_COMMAND_NAME_RULE}: ${parsedEntry.entry.name}.`,
				diagnosticLocation(options.packageJsonPath, commandName),
			),
		);
	}

	let entryPath: string | undefined;
	if (parsedEntry.entry.entry !== undefined) {
		const entryPathValidation = validateManifestEntryPath({
			packageDir: options.packageDir,
			packageJsonPath: options.packageJsonPath,
			rawEntryPath: parsedEntry.entry.entry,
			commandName,
		});
		if (entryPathValidation.ok) {
			entryPath = entryPathValidation.entryPath;
		} else {
			diagnostics.push(...entryPathValidation.diagnostics);
		}
	}

	if (
		diagnostics.length > 0 ||
		parsedEntry.entry.name === undefined ||
		parsedEntry.entry.description === undefined ||
		parsedEntry.entry.fullDescription === undefined ||
		entryPath === undefined
	) {
		return { ok: false, diagnostics };
	}

	const displayPath = relativeDisplayPath(options.rootDir, entryPath);
	return {
		ok: true,
		command: {
			kind: "package",
			...(parsedEntry.entry.group === undefined ? {} : { group: parsedEntry.entry.group }),
			...(parsedEntry.entry.segments === undefined ? {} : { segments: parsedEntry.entry.segments }),
			...(parsedEntry.entry.groupDescription === undefined
				? {}
				: { groupDescription: parsedEntry.entry.groupDescription }),
			name: parsedEntry.entry.name,
			description: parsedEntry.entry.description,
			fullDescription: parsedEntry.entry.fullDescription,
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
}):
	| { ok: true; entryPath: string }
	| { ok: false; diagnostics: readonly ExtensionDiscoveryDiagnostic[] } {
	if (options.rawEntryPath.startsWith("/") || options.rawEntryPath.includes("\\")) {
		return {
			ok: false,
			diagnostics: [
				diagnostic(
					"extension_manifest_entry_not_relative",
					`Extension manifest command entry must be a relative POSIX-style path inside the package: ${options.rawEntryPath}.`,
					diagnosticLocation(options.packageJsonPath, options.commandName),
				),
			],
		};
	}

	const resolvedEntry = resolve(options.packageDir, options.rawEntryPath);
	if (!isPathInside(options.packageDir, resolvedEntry)) {
		return {
			ok: false,
			diagnostics: [
				diagnostic(
					"extension_manifest_entry_escapes",
					`Extension manifest command entry must not escape its package directory: ${options.rawEntryPath}.`,
					diagnosticLocation(options.packageJsonPath, options.commandName),
				),
			],
		};
	}
	if (!isLoadableExtensionFile(basename(resolvedEntry))) {
		return {
			ok: false,
			diagnostics: [
				diagnostic(
					"extension_manifest_entry_unsupported",
					`Extension manifest command entry must be a .ts or .js file, excluding .d.ts: ${options.rawEntryPath}.`,
					diagnosticLocation(options.packageJsonPath, options.commandName),
				),
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
				diagnostic(
					"extension_manifest_entry_missing",
					`Extension manifest command entry does not exist: ${options.rawEntryPath}.`,
					diagnosticLocation(options.packageJsonPath, options.commandName),
				),
			],
		};
	}
	if (!entryStat.isFile()) {
		return {
			ok: false,
			diagnostics: [
				diagnostic(
					"extension_manifest_entry_not_file",
					`Extension manifest command entry must be a file: ${options.rawEntryPath}.`,
					diagnosticLocation(options.packageJsonPath, options.commandName),
				),
			],
		};
	}
	return { ok: true, entryPath: resolvedEntry };
}

function commandNameFromManifestPath(segments: readonly string[] | undefined): string | undefined {
	if (segments === undefined || segments.length === 0) return undefined;
	return commandLeafName({ name: segments.at(-1) ?? "", segments });
}

function parseManifestCommandEntry(options: {
	entry: SdlExtensionManifestCommand;
	packageGroup: string | undefined;
	packageGroupDescription: string | undefined;
	packageJsonPath: string;
}): {
	entry: ParsedManifestCommandEntryFields;
	diagnostics: readonly ExtensionDiscoveryDiagnostic[];
	commandName: string | undefined;
} {
	const rawPath = parseManifestPath(options.entry.path);
	const explicitName = readNonEmptyString(options.entry.name);
	const commandName = explicitName ?? commandNameFromManifestPath(rawPath.value);
	const rawEntryGroup = options.entry.group;
	const entryGroup =
		rawEntryGroup === undefined ? options.packageGroup : readNonEmptyString(rawEntryGroup);
	const segments =
		rawPath.value === undefined
			? undefined
			: [...(entryGroup === undefined ? [] : [entryGroup]), ...rawPath.value];
	const packageGroupDescription = options.packageGroupDescription;
	const shouldApplyPackageGroupDescription =
		packageGroupDescription !== undefined &&
		(entryGroup !== undefined || (segments?.length ?? 0) > 1);
	const fields: ParsedManifestCommandEntryFields = {
		group: entryGroup,
		name: commandName,
		segments,
		...(shouldApplyPackageGroupDescription ? { groupDescription: packageGroupDescription } : {}),
		description: undefined,
		entry: undefined,
		fullDescription: undefined,
	};
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [...rawPath.diagnostics];
	const entryGroupDiagnostic = groupDiagnostic({
		group: rawEntryGroup,
		packageJsonPath: options.packageJsonPath,
		commandName,
	});
	if (entryGroupDiagnostic !== undefined) diagnostics.push(entryGroupDiagnostic);

	if (explicitName !== undefined) {
		fields.name = explicitName;
	} else if (rawPath.value === undefined || options.entry.name !== undefined) {
		pushManifestStringDiagnostic({
			diagnostics,
			code: "extension_manifest_command_name_missing",
			field: "name",
			packageJsonPath: options.packageJsonPath,
			commandName,
		});
	}

	for (const { field, code } of requiredManifestCommandStringFields) {
		const value = readNonEmptyString(options.entry[field]);
		if (value !== undefined) {
			fields[field] = value;
			continue;
		}
		pushManifestStringDiagnostic({
			diagnostics,
			code,
			field,
			packageJsonPath: options.packageJsonPath,
			commandName,
		});
	}

	const fullDescription = readNonEmptyString(options.entry.fullDescription);
	if (fullDescription !== undefined) {
		fields.fullDescription = fullDescription;
	} else if (options.entry.fullDescription === undefined) {
		fields.fullDescription = fields.description;
	} else {
		pushManifestStringDiagnostic({
			diagnostics,
			code: "extension_manifest_command_full_description_invalid",
			field: "fullDescription",
			packageJsonPath: options.packageJsonPath,
			commandName,
		});
	}

	return { entry: fields, diagnostics, commandName };
}

function pushManifestStringDiagnostic(options: {
	diagnostics: ExtensionDiscoveryDiagnostic[];
	code: string;
	field: string;
	packageJsonPath: string;
	commandName: string | undefined;
}): void {
	options.diagnostics.push(
		diagnostic(
			options.code,
			`Extension manifest command ${options.field} must be a non-empty string: ${options.packageJsonPath}.`,
			diagnosticLocation(options.packageJsonPath, options.commandName),
		),
	);
}

function groupDiagnostic(options: {
	group: unknown;
	packageJsonPath: string;
	commandName: string | undefined;
}): ExtensionDiscoveryDiagnostic | undefined {
	if (options.group === undefined) return undefined;
	const group = readNonEmptyString(options.group);
	if (group !== undefined && SDL_COMMAND_NAME_PATTERN.test(group)) return undefined;
	return diagnostic(
		"extension_manifest_command_group_invalid",
		`Extension manifest command group must match ${SDL_COMMAND_NAME_RULE}.`,
		diagnosticLocation(options.packageJsonPath, options.commandName),
	);
}

function parseManifestPath(value: unknown): {
	value: readonly string[] | undefined;
	diagnostics: readonly ExtensionDiscoveryDiagnostic[];
} {
	if (value === undefined) return { value: undefined, diagnostics: [] };
	if (!Array.isArray(value) || value.length === 0) {
		return {
			value: undefined,
			diagnostics: [
				diagnostic(
					"extension_manifest_command_path_invalid",
					`Extension manifest command path must be a non-empty array of segments matching ${SDL_COMMAND_NAME_RULE}.`,
				),
			],
		};
	}
	const segments = value.filter((segment): segment is string => typeof segment === "string");
	if (
		segments.length !== value.length ||
		segments.some((segment) => !SDL_COMMAND_NAME_PATTERN.test(segment))
	) {
		return {
			value: undefined,
			diagnostics: [
				diagnostic(
					"extension_manifest_command_path_invalid",
					`Extension manifest command path segments must match ${SDL_COMMAND_NAME_RULE}.`,
				),
			],
		};
	}
	return { value: segments, diagnostics: [] };
}

function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined;
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

function relativeDisplayPath(rootDir: string, entryPath: string): string {
	return join(basename(rootDir), relative(rootDir, entryPath));
}

function commandSortKey(command: DiscoveredExtensionCommand): string {
	return command.displayPath;
}

function diagnosticLocation(
	path: string,
	commandName: string | undefined,
): { path: string; commandName?: string } {
	return {
		path,
		...optionalEntry("commandName", commandName),
	};
}

function diagnostic(
	code: string,
	message: string,
	options: { path?: string; commandName?: string } = {},
): ExtensionDiscoveryDiagnostic {
	return {
		severity: "error",
		code,
		message,
		...optionalEntries({ path: options.path, commandName: options.commandName }),
	};
}
