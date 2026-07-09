import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { RawArgvCommand } from "./command.ts";

export type DescriptorCommand = RawArgvCommand;

export interface RawArgvCommandModule<TCommand extends DescriptorCommand = DescriptorCommand> {
	readonly default: TCommand;
}

export type RawArgvCommandLoad<TCommand extends DescriptorCommand = DescriptorCommand> = () =>
	| Promise<RawArgvCommandModule<TCommand>>
	| RawArgvCommandModule<TCommand>;

export interface ExtensionCommandEntry<TCommand extends DescriptorCommand = DescriptorCommand> {
	readonly name: string;
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

export interface ExtensionDescriptor {
	readonly group?: string;
	readonly description: string;
	readonly entries?: readonly ExtensionEntry[];
	readonly points?: readonly ExtensionPointDefinition[];
	readonly bundledArtifacts?: readonly BundledArtifactDefinition[];
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

const commandEntrySchema: z.ZodType<ExtensionCommandEntry> = z.strictObject({
	name: z.string().min(1),
	load: z.custom<RawArgvCommandLoad>((value) => typeof value === "function"),
});

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

export const extensionDescriptorSchema: z.ZodType<ExtensionDescriptor> = z
	.strictObject({
		group: z.string().min(1).optional(),
		description: z.string().min(1),
		entries: z.array(extensionEntrySchema).optional(),
		points: z.array(extensionPointDefinitionSchema).optional(),
		bundledArtifacts: z.array(bundledArtifactDefinitionSchema).optional(),
	})
	.transform(
		(descriptor): ExtensionDescriptor => ({
			...optionalEntries({ group: descriptor.group }),
			description: descriptor.description,
			...optionalEntries({
				entries: descriptor.entries,
				points: descriptor.points,
				bundledArtifacts: descriptor.bundledArtifacts,
			}),
		}),
	);

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
	const path = issue.path.join(".");
	const field = path.length === 0 ? "default export" : path;
	return `${field} ${issue.message}`;
}
