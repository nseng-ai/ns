import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { ExplicitUndefined } from "@nseng-ai/foundation/primitives";

export interface DescriptorCommand {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly run: CallableFunction;
	readonly complete?: ExplicitUndefined<"public-api-compatibility", CallableFunction>;
}

export interface RawArgvCommandModule<TCommand extends DescriptorCommand = DescriptorCommand> {
	readonly default: TCommand;
}

export type RawArgvCommandLoad<TCommand extends DescriptorCommand = DescriptorCommand> = () =>
	| Promise<RawArgvCommandModule<TCommand>>
	| RawArgvCommandModule<TCommand>;

export interface ExtensionCommandEntry<TCommand extends DescriptorCommand = DescriptorCommand> {
	readonly name: string;
	/** Omit this command when the named extension package is absent from the effective registry. */
	readonly requiresExtension?: string;
	/**
	 * Lazy command-module thunk. Keep this as a literal dynamic import, for example
	 * `() => import("./commands/list.ts")`: bundlers discover `import("literal")`
	 * lexically while parsing, even inside callbacks. Computed specifiers such as
	 * `import(commandPath)` are opaque to bundlers and break bundled descriptors.
	 */
	readonly load: RawArgvCommandLoad<TCommand>;
}

export interface ExtensionGroupEntry {
	readonly group: string;
	readonly description: string;
	readonly hidden?: boolean;
	readonly entries: readonly ExtensionEntry[];
}

export type ExtensionEntry = ExtensionCommandEntry | ExtensionGroupEntry;

export const extensionPointAcceptsValues = ["hook", "prompt"] as const;
export const extensionPointCardinalityValues = ["many", "one"] as const;

export interface ExtensionPointDefinition {
	readonly id: string;
	readonly accepts: (typeof extensionPointAcceptsValues)[number];
	readonly cardinality: (typeof extensionPointCardinalityValues)[number];
	readonly description?: string;
	readonly default?: string;
}

export interface BundledArtifactDefinition {
	readonly kind: "skill";
	readonly name: string;
	readonly path: string;
	readonly description?: string;
}

export interface ExtensionActivation {
	readonly instructions?: string;
	readonly consumerDirs?: readonly string[];
}

export interface ExtensionDescriptor {
	readonly group?: string;
	readonly description: string;
	readonly entries?: readonly ExtensionEntry[];
	readonly points?: readonly ExtensionPointDefinition[];
	readonly activation?: ExtensionActivation;
	readonly bundledArtifacts?: readonly BundledArtifactDefinition[];
}

export function hiddenExecGroup(
	description: string,
	entries: readonly ExtensionEntry[],
): ExtensionGroupEntry {
	return { group: "exec", hidden: true, description, entries };
}

export function nsExtensionExportTarget(exportsField: unknown): string | undefined {
	const exportsResult = z.record(z.string(), z.unknown()).safeParse(exportsField);
	if (!exportsResult.success) return undefined;
	const nsExtensionExport = exportsResult.data["./ns-extension"];
	if (typeof nsExtensionExport === "string") return nsExtensionExport;
	const conditionalExportResult = z.record(z.string(), z.unknown()).safeParse(nsExtensionExport);
	if (!conditionalExportResult.success) return undefined;
	const importTarget = conditionalExportResult.data["import"];
	if (typeof importTarget === "string") return importTarget;
	const defaultTarget = conditionalExportResult.data["default"];
	return typeof defaultTarget === "string" ? defaultTarget : undefined;
}

export type ExtensionDescriptorValidationResult =
	| { readonly ok: true; readonly descriptor: ExtensionDescriptor }
	| { readonly ok: false; readonly message: string };

export type LoadedCommandNameValidationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly message: string };

const commandEntrySchema: z.ZodType<ExtensionCommandEntry> = z
	.strictObject({
		name: z.string().min(1),
		requiresExtension: z.string().min(1).optional(),
		load: z.custom<RawArgvCommandLoad>((value) => typeof value === "function"),
	})
	.transform(
		(entry): ExtensionCommandEntry => ({
			name: entry.name,
			...optionalEntries({ requiresExtension: entry.requiresExtension }),
			load: entry.load,
		}),
	);

const groupEntrySchema: z.ZodType<ExtensionGroupEntry> = z.lazy(() =>
	z
		.strictObject({
			group: z.string().min(1),
			description: z.string().min(1),
			hidden: z.boolean().optional(),
			entries: z.array(extensionEntrySchema),
		})
		.transform(
			(entry): ExtensionGroupEntry => ({
				group: entry.group,
				description: entry.description,
				...optionalEntries({ hidden: entry.hidden }),
				entries: entry.entries,
			}),
		),
);

const extensionEntrySchema: z.ZodType<ExtensionEntry> = z.union([
	commandEntrySchema,
	groupEntrySchema,
]);

export const extensionPointDefinitionSchema: z.ZodType<ExtensionPointDefinition> = z
	.strictObject({
		id: z.string().min(1),
		accepts: z.enum(extensionPointAcceptsValues),
		cardinality: z.enum(extensionPointCardinalityValues),
		description: z.string().optional(),
		default: z.string().optional(),
	})
	.transform(
		(point): ExtensionPointDefinition => ({
			id: point.id,
			accepts: point.accepts,
			cardinality: point.cardinality,
			...optionalEntries({ description: point.description, default: point.default }),
		}),
	);

export const bundledArtifactDefinitionSchema: z.ZodType<BundledArtifactDefinition> = z
	.strictObject({
		kind: z.literal("skill"),
		name: z.string().min(1),
		path: z.string().min(1),
		description: z.string().optional(),
	})
	.transform(
		(artifact): BundledArtifactDefinition => ({
			kind: artifact.kind,
			name: artifact.name,
			path: artifact.path,
			...optionalEntries({ description: artifact.description }),
		}),
	);

const activationInstructionsSchema = z.string().refine(isSingleLevelTwoMarkdownSection, {
	message:
		"must begin with a non-empty level-2 Markdown heading and contain exactly one level-2 section",
});

const activationConsumerDirSchema = z.string().refine(isCanonicalConsumerDir, {
	message: 'must be a canonical repository-relative directory strictly beneath ".ns/"',
});

const extensionActivationSchema: z.ZodType<ExtensionActivation> = z
	.strictObject({
		instructions: activationInstructionsSchema.optional(),
		consumerDirs: z
			.array(activationConsumerDirSchema)
			.superRefine((consumerDirs, context) => {
				const firstIndexes = new Map<string, number>();
				for (const [index, consumerDir] of consumerDirs.entries()) {
					const firstIndex = firstIndexes.get(consumerDir);
					if (firstIndex === undefined) {
						firstIndexes.set(consumerDir, index);
						continue;
					}
					context.addIssue({
						code: "custom",
						message: `duplicates entry at index ${firstIndex}`,
						path: [index],
					});
				}
			})
			.optional(),
	})
	.transform(
		(activation): ExtensionActivation => ({
			...optionalEntries({
				instructions: activation.instructions,
				consumerDirs: activation.consumerDirs,
			}),
		}),
	);

export const extensionDescriptorSchema: z.ZodType<ExtensionDescriptor> = z
	.strictObject({
		group: z.string().min(1).optional(),
		description: z.string().min(1),
		entries: z.array(extensionEntrySchema).optional(),
		points: z.array(extensionPointDefinitionSchema).optional(),
		activation: extensionActivationSchema.optional(),
		bundledArtifacts: z.array(bundledArtifactDefinitionSchema).optional(),
	})
	.transform(
		(descriptor): ExtensionDescriptor => ({
			...optionalEntries({ group: descriptor.group }),
			description: descriptor.description,
			...optionalEntries({
				entries: descriptor.entries,
				points: descriptor.points,
				activation: descriptor.activation,
				bundledArtifacts: descriptor.bundledArtifacts,
			}),
		}),
	);

function isSingleLevelTwoMarkdownSection(instructions: string): boolean {
	const [heading, ...remainingLines] = instructions.split("\n");
	if (heading === undefined || !heading.startsWith("## ") || heading.slice(3).trim() === "") {
		return false;
	}
	return remainingLines.every((line) => !line.startsWith("## "));
}

function isCanonicalConsumerDir(consumerDir: string): boolean {
	if (!consumerDir.startsWith(".ns/") || consumerDir.includes("\\")) return false;
	const segments = consumerDir.split("/");
	return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function validateExtensionDescriptor(
	value: unknown,
	label = "ns extension descriptor",
): ExtensionDescriptorValidationResult {
	const parsed = extensionDescriptorSchema.safeParse(value);
	if (parsed.success) return { ok: true, descriptor: parsed.data };
	return {
		ok: false,
		message: `Invalid ${label}: ${formatExtensionDescriptorIssue(parsed.error.issues[0])}`,
	};
}

export function validateLoadedCommandName(
	entry: Pick<ExtensionCommandEntry, "name">,
	command: Pick<DescriptorCommand, "name">,
): LoadedCommandNameValidationResult {
	if (entry.name === command.name) return { ok: true };
	return {
		ok: false,
		message: `Loaded command name mismatch: descriptor entry "${entry.name}" loaded command "${command.name}".`,
	};
}

function formatExtensionDescriptorIssue(issue: z.core.$ZodIssue | undefined): string {
	if (issue === undefined) return "descriptor did not match the expected shape.";
	const specificIssue = mostSpecificDescriptorIssue(issue);
	const path = specificIssue.path.join(".");
	const field = path.length === 0 ? "default export" : path;
	return `${field} ${specificIssue.message}`;
}

interface FormattedDescriptorIssue {
	readonly path: readonly PropertyKey[];
	readonly message: string;
}

function mostSpecificDescriptorIssue(
	issue: z.core.$ZodIssue,
	prefix: readonly PropertyKey[] = [],
): FormattedDescriptorIssue {
	const path = [...prefix, ...issue.path];
	if (issue.code !== "invalid_union") return { path, message: issue.message };
	const nestedIssues = issue.errors
		.flat()
		.map((nestedIssue) => mostSpecificDescriptorIssue(nestedIssue, path));
	return nestedIssues.reduce((mostSpecific, candidate) =>
		candidate.path.length > mostSpecific.path.length ? candidate : mostSpecific,
	);
}
