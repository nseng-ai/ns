import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

import { isPathInside, optionalEntry, type ZodIssueLike } from "@nseng-ai/foundation/primitives";
import {
	nsExtensionManifestCommandSchema,
	nsExtensionPackageManifestSchema,
	type NsExtensionManifestCommand,
	type NsExtensionPackageManifest,
} from "../sdk/index.ts";

import {
	commandLeafName,
	formatUnknownError,
	type NsCommandCandidate,
} from "./command-registry.ts";
import { NS_COMMAND_NAME_PATTERN, NS_COMMAND_NAME_RULE } from "../sdk/command-name.ts";
import type { NsCommandModuleReference } from "./module-reference.ts";
import { makeKernelDiagnostic } from "../runtime/diagnostics.ts";
import { scanExtensionRoot } from "../runtime/extension-root-discovery.ts";
import { classifyFirstMatchingZodIssuePath, type ZodIssuePathRule } from "./zod-issue-path.ts";

export interface DiscoveredExtensionCommand extends Pick<
	NsCommandCandidate,
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
	hasStaticCommandInfo: boolean;
	moduleReference?: NsCommandModuleReference;
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

type ManifestStructureIssueKind = "missing-ns" | "commands-not-array" | "other";

const manifestStructureIssueRules: readonly ZodIssuePathRule<ManifestStructureIssueKind>[] = [
	{ pattern: [], match: "exact", value: "missing-ns" },
	{ pattern: ["ns"], match: "exact", value: "missing-ns" },
	{ pattern: ["ns", "commands"], match: "prefix", value: "commands-not-array" },
];

type PackageManifestParseResult =
	| { outcome: "ok"; manifest: NsExtensionPackageManifest }
	| { outcome: "parse-failed"; diagnostic: ExtensionDiscoveryDiagnostic }
	| { outcome: "schema-failed"; issues: readonly ZodIssueLike[] };

type PackageManifestDiscoveryResolution =
	| { outcome: "ok"; manifest: NsExtensionPackageManifest }
	| { outcome: "unavailable"; result: ExtensionDiscoveryResult };

export function discoverExtensionsInRoot(rootDir: string): ExtensionDiscoveryResult {
	const rootScan = scanExtensionRoot(rootDir);
	if (rootScan.diagnostics.length > 0) {
		return { commands: [], diagnostics: rootScan.diagnostics };
	}

	const commands: DiscoveredExtensionCommand[] = [];
	const diagnostics: ExtensionDiscoveryDiagnostic[] = [];
	for (const entry of rootScan.entries) {
		if (entry.type === "file") {
			if (isLoadableExtensionFile(entry.name)) {
				pushDirectEntryCommand(
					commands,
					diagnostics,
					commandForDirectEntry({
						rootDir,
						name: basename(entry.name, extname(entry.name)),
						entryPath: entry.path,
					}),
				);
			}
			continue;
		}

		if (entry.packageJsonPath !== undefined) {
			const packageResult = discoverPackageCommands(rootDir, entry.path, entry.packageJsonPath);
			commands.push(...packageResult.commands);
			diagnostics.push(...packageResult.diagnostics);
			continue;
		}

		if (entry.indexPath !== undefined) {
			pushDirectEntryCommand(
				commands,
				diagnostics,
				commandForDirectEntry({
					rootDir,
					name: entry.name,
					entryPath: entry.indexPath,
				}),
			);
			continue;
		}
		diagnostics.push(
			diagnostic(
				"extension_directory_missing_entry",
				`Extension directory must contain package.json, index.ts, or index.js: ${entry.path}.`,
				{ path: entry.path, commandName: entry.name },
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

export function discoverNsPackageCommands(
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
	if (resolution.manifest.ns?.commands === undefined) return { commands: [], diagnostics: [] };
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
	const manifestResult = nsExtensionPackageManifestSchema.safeParse(parsed);
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
	parsedManifest?: NsExtensionPackageManifest,
): ExtensionDiscoveryResult {
	let manifest: NsExtensionPackageManifest;
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

	if (manifest.ns === undefined) {
		return {
			commands: [],
			diagnostics: [missingNsDiagnostic(packageJsonPath)],
		};
	}
	const packageGroup = readNonEmptyString(manifest.ns.group);
	const packageGroupDescription =
		readNonEmptyString(manifest.ns.description) ?? readNonEmptyString(manifest.description);
	const packageGroupDiagnostic = groupDiagnostic({
		group: manifest.ns.group,
		packageJsonPath,
		commandName: undefined,
	});
	if (packageGroupDiagnostic !== undefined) {
		return { commands: [], diagnostics: [packageGroupDiagnostic] };
	}
	const entries = manifest.ns.commands;
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
	if (kind === "missing-ns") return missingNsDiagnostic(packageJsonPath);
	if (kind === "commands-not-array") return commandsNotArrayDiagnostic(packageJsonPath);
	return diagnostic(
		"extension_manifest_invalid",
		`Extension manifest contains invalid ns metadata: ${packageJsonPath}.`,
		{ path: packageJsonPath },
	);
}

function missingNsDiagnostic(packageJsonPath: string): ExtensionDiscoveryDiagnostic {
	return diagnostic(
		"extension_manifest_missing_ns",
		`Extension manifest must contain an ns object: ${packageJsonPath}.`,
		{ path: packageJsonPath },
	);
}

function commandsNotArrayDiagnostic(packageJsonPath: string): ExtensionDiscoveryDiagnostic {
	return diagnostic(
		"extension_manifest_commands_not_array",
		`Extension manifest ns.commands must be an array: ${packageJsonPath}.`,
		{ path: packageJsonPath },
	);
}

function pushDirectEntryCommand(
	commands: DiscoveredExtensionCommand[],
	diagnostics: ExtensionDiscoveryDiagnostic[],
	command:
		| { ok: true; command: DiscoveredExtensionCommand }
		| { ok: false; diagnostic: ExtensionDiscoveryDiagnostic },
): void {
	if (command.ok) commands.push(command.command);
	else diagnostics.push(command.diagnostic);
}

function commandForDirectEntry(options: {
	name: string;
	entryPath: string;
	rootDir: string;
}):
	| { ok: true; command: DiscoveredExtensionCommand }
	| { ok: false; diagnostic: ExtensionDiscoveryDiagnostic } {
	if (!NS_COMMAND_NAME_PATTERN.test(options.name)) {
		return {
			ok: false,
			diagnostic: diagnostic(
				"extension_command_name_invalid",
				`ns command entry name inferred from ${options.entryPath} must match ${NS_COMMAND_NAME_RULE}.`,
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
	const entryResult = nsExtensionManifestCommandSchema.safeParse(options.entry);
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
		!NS_COMMAND_NAME_PATTERN.test(parsedEntry.entry.name)
	) {
		diagnostics.push(
			diagnostic(
				"extension_manifest_command_name_invalid",
				`Extension manifest command name must match ${NS_COMMAND_NAME_RULE}: ${parsedEntry.entry.name}.`,
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
			hasStaticCommandInfo: true,
			...moduleReferenceForEntryPath(entryPath),
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
	entry: NsExtensionManifestCommand;
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
	if (group !== undefined && NS_COMMAND_NAME_PATTERN.test(group)) return undefined;
	return diagnostic(
		"extension_manifest_command_group_invalid",
		`Extension manifest command group must match ${NS_COMMAND_NAME_RULE}.`,
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
					`Extension manifest command path must be a non-empty array of segments matching ${NS_COMMAND_NAME_RULE}.`,
				),
			],
		};
	}
	const segments = value.filter((segment): segment is string => typeof segment === "string");
	if (
		segments.length !== value.length ||
		segments.some((segment) => !NS_COMMAND_NAME_PATTERN.test(segment))
	) {
		return {
			value: undefined,
			diagnostics: [
				diagnostic(
					"extension_manifest_command_path_invalid",
					`Extension manifest command path segments must match ${NS_COMMAND_NAME_RULE}.`,
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
	name: string;
	entryPath: string;
	rootDir: string;
}): DiscoveredExtensionCommand {
	const description = `Run ns command entry '${options.name}'.`;
	return {
		hasStaticCommandInfo: false,
		...moduleReferenceForEntryPath(options.entryPath),
		name: options.name,
		description,
		fullDescription: description,
		entryPath: options.entryPath,
		displayPath: relativeDisplayPath(options.rootDir, options.entryPath),
	};
}

function moduleReferenceForEntryPath(entryPath: string): {
	moduleReference?: NsCommandModuleReference;
} {
	let source: string;
	try {
		source = readFileSync(entryPath, "utf8");
	} catch {
		// Entry-file package-shim recognition is best-effort at discovery time; unreadable
		// entries stay as file references and selected loading reports the concrete failure.
		return {};
	}
	const specifier = parseDefaultReexportShimSpecifier(source);
	return optionalEntry(
		"moduleReference",
		specifier === undefined ? undefined : { type: "package", specifier },
	);
}

function parseDefaultReexportShimSpecifier(source: string): string | undefined {
	const match = source.trim().match(/^export\s+\{\s*default\s*\}\s+from\s+["']([^"']+)["'];?$/u);
	return match?.[1];
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
	return makeKernelDiagnostic({
		code,
		message,
		...optionalEntry("path", options.path),
		extra: optionalEntry("commandName", options.commandName),
	});
}
