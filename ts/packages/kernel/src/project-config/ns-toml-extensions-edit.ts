import { resolve } from "node:path";

import { parseDeclaredExtensionSpecsToml } from "./descriptor-package.ts";
import { parseExtensionSourceSpec, type ExtensionSourceSpec } from "./extension-source-spec.ts";

export interface ExtensionSourceIdentity {
	readonly kind: "npm" | "local";
	readonly value: string;
}

export type NsTomlExtensionsAppendResult =
	| {
			readonly ok: true;
			readonly text: string;
			readonly isAdded: boolean;
	  }
	| {
			readonly ok: false;
			readonly reason: "invalid-toml" | "invalid-extensions" | "unsupported-format";
			readonly message: string;
	  };

export type NsTomlExtensionInstallPlan =
	| NsTomlExtensionsAppendResult
	| {
			readonly ok: false;
			readonly reason: "identity-conflict";
			readonly identity: ExtensionSourceIdentity;
			readonly requestedSpec: string;
			readonly existingSpecs: readonly string[];
			readonly message: string;
	  }
	| {
			readonly ok: false;
			readonly reason: "invalid-source";
			readonly requestedSpec: string;
			readonly message: string;
	  };

export function planDeclaredExtensionInstallToml(options: {
	readonly projectRoot: string;
	readonly source: string;
	readonly requestedSpec: string;
}): NsTomlExtensionInstallPlan {
	const parsed = parseDeclaredExtensionSpecsToml(options.source);
	if (!parsed.ok) return { ok: false, reason: parsed.reason, message: parsed.message };
	const identity = extensionSourceIdentity(options.projectRoot, options.requestedSpec);
	if (identity === undefined) {
		return {
			ok: false,
			reason: "invalid-source",
			requestedSpec: options.requestedSpec,
			message: `Extension source must be an npm: spec or an unprefixed local path: ${options.requestedSpec}.`,
		};
	}
	if (parsed.specs.includes(options.requestedSpec)) {
		return { ok: true, text: options.source, isAdded: false };
	}
	const existingSpecs = parsed.specs.filter((spec) =>
		identitiesEqual(identity, extensionSourceIdentity(options.projectRoot, spec)),
	);
	if (existingSpecs.length > 0) {
		return {
			ok: false,
			reason: "identity-conflict",
			identity,
			requestedSpec: options.requestedSpec,
			existingSpecs,
			message: extensionIdentityConflictMessage(identity, existingSpecs),
		};
	}
	return appendDeclaredExtensionSpecToml(options.source, options.requestedSpec);
}

export function extensionSourceIdentity(
	projectRoot: string,
	spec: string,
): ExtensionSourceIdentity | undefined {
	if (!spec.startsWith("npm:") && /^[a-z][a-z0-9+.-]*:/iu.test(spec)) return undefined;
	const parsed = parseExtensionSourceSpec(projectRoot, spec);
	if (!parsed.ok || parsed.value.kind === "git") return undefined;
	return identityFromParsedSource(projectRoot, parsed.value);
}

export function appendDeclaredExtensionSpecToml(
	source: string,
	spec: string,
): NsTomlExtensionsAppendResult {
	const parsed = parseDeclaredExtensionSpecsToml(source);
	if (!parsed.ok) {
		return { ok: false, reason: parsed.reason, message: parsed.message };
	}
	if (parsed.specs.includes(spec)) return { ok: true, text: source, isAdded: false };
	if (parsed.specs.length === 0 && !hasTopLevelExtensionsAssignment(source)) {
		const prefix = source.trimEnd();
		return {
			ok: true,
			text: `${prefix}${prefix === "" ? "" : "\n"}extensions = [${JSON.stringify(spec)}]\n`,
			isAdded: true,
		};
	}
	const replacement = appendToExistingExtensionsArray(source, spec);
	if (replacement === undefined) {
		return {
			ok: false,
			reason: "unsupported-format",
			message:
				"Top-level ns.toml extensions assignment must be a textual array before an extension can be installed.",
		};
	}
	return { ok: true, text: replacement, isAdded: true };
}

function hasTopLevelExtensionsAssignment(source: string): boolean {
	return findTopLevelExtensionsLine(source.split(/(?<=\n)/u)) !== undefined;
}

function appendToExistingExtensionsArray(source: string, spec: string): string | undefined {
	const lines = source.split(/(?<=\n)/u);
	const offsets = lineStartOffsets(lines);
	const startIndex = findTopLevelExtensionsLine(lines);
	if (startIndex === undefined) return undefined;
	const startLine = lines[startIndex];
	if (startLine === undefined) return undefined;
	const equalsIndex = startLine.indexOf("=");
	const openIndex = startLine.indexOf("[", equalsIndex);
	if (equalsIndex === -1 || openIndex === -1) return undefined;
	const openOffset = (offsets[startIndex] ?? 0) + openIndex;
	const layout = scanExtensionsArray(source, openOffset);
	if (layout === undefined) return undefined;
	const closeLineIndex = offsets.findIndex(
		(offset, index) =>
			layout.closeOffset >= offset && layout.closeOffset < offset + (lines[index]?.length ?? 0),
	);
	if (closeLineIndex === -1) return undefined;
	return appendBeforeArrayClose({
		source,
		lines,
		startIndex,
		closeLineIndex,
		spec,
		layout,
	});
}

function appendBeforeArrayClose(options: {
	readonly source: string;
	readonly lines: readonly string[];
	readonly startIndex: number;
	readonly closeLineIndex: number;
	readonly spec: string;
	readonly layout: ExtensionsArrayLayout;
}): string {
	const offsets = lineStartOffsets(options.lines);
	const closeLineOffset = offsets[options.closeLineIndex] ?? 0;
	const closeOffset = options.layout.closeOffset;
	const encodedSpec = JSON.stringify(options.spec);
	if (options.closeLineIndex === options.startIndex) {
		const separator =
			options.layout.lastValueEnd === undefined || options.layout.hasTrailingComma ? "" : ",";
		const trailingComma = options.layout.hasTrailingComma ? "," : "";
		return `${options.source.slice(0, closeOffset)}${separator} ${encodedSpec}${trailingComma}${options.source.slice(closeOffset)}`;
	}
	const closeLine = options.lines[options.closeLineIndex] ?? "";
	const closeIndent = closeLine.match(/^\s*/u)?.[0] ?? "";
	const itemIndent =
		options.layout.lastValueStart === undefined
			? `${closeIndent}\t`
			: indentationAt(options.source, options.layout.lastValueStart);
	const trailingComma = options.layout.hasTrailingComma ? "," : "";
	let next = `${options.source.slice(0, closeLineOffset)}${itemIndent}${encodedSpec}${trailingComma}\n${options.source.slice(closeLineOffset)}`;
	if (options.layout.lastValueEnd !== undefined && !options.layout.hasTrailingComma) {
		next = `${next.slice(0, options.layout.lastValueEnd)},${next.slice(options.layout.lastValueEnd)}`;
	}
	return next;
}

interface ExtensionsArrayLayout {
	readonly closeOffset: number;
	readonly lastValueStart: number | undefined;
	readonly lastValueEnd: number | undefined;
	readonly hasTrailingComma: boolean;
}

function scanExtensionsArray(
	source: string,
	openOffset: number,
): ExtensionsArrayLayout | undefined {
	if (openOffset < 0 || source[openOffset] !== "[") return undefined;
	let depth = 1;
	let quote: '"' | "'" | undefined;
	let isEscaped = false;
	let isComment = false;
	let valueStart: number | undefined;
	let lastValueStart: number | undefined;
	let lastValueEnd: number | undefined;
	let hasTrailingComma = false;
	for (let index = openOffset + 1; index < source.length; index += 1) {
		const char = source[index];
		if (isComment) {
			if (char === "\n") isComment = false;
			continue;
		}
		if (quote !== undefined) {
			if (quote === '"' && char === "\\" && !isEscaped) {
				isEscaped = true;
				continue;
			}
			if (char === quote && !isEscaped) {
				if (depth === 1) {
					lastValueStart = valueStart;
					lastValueEnd = index + 1;
					hasTrailingComma = false;
				}
				quote = undefined;
				valueStart = undefined;
			}
			isEscaped = false;
			continue;
		}
		if (char === "#") {
			isComment = true;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			if (depth === 1) valueStart = index;
			continue;
		}
		if (char === "[") {
			depth += 1;
			continue;
		}
		if (char === "]") {
			depth -= 1;
			if (depth === 0) {
				return { closeOffset: index, lastValueStart, lastValueEnd, hasTrailingComma };
			}
			continue;
		}
		if (depth === 1 && char === "," && lastValueEnd !== undefined) hasTrailingComma = true;
	}
	return undefined;
}

function indentationAt(source: string, offset: number): string {
	const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
	return source.slice(lineStart, offset).match(/^\s*/u)?.[0] ?? "";
}

function lineStartOffsets(lines: readonly string[]): readonly number[] {
	let offset = 0;
	const offsets: number[] = [];
	for (const line of lines) {
		offsets.push(offset);
		offset += line.length;
	}
	return offsets;
}

function identityFromParsedSource(
	projectRoot: string,
	source: Exclude<ExtensionSourceSpec, { kind: "git" }>,
): ExtensionSourceIdentity {
	if (source.kind === "npm") return { kind: "npm", value: source.packageName };
	return { kind: "local", value: resolve(projectRoot, source.path) };
}

function identitiesEqual(
	left: ExtensionSourceIdentity,
	right: ExtensionSourceIdentity | undefined,
): boolean {
	return right !== undefined && left.kind === right.kind && left.value === right.value;
}

function extensionIdentityConflictMessage(
	identity: ExtensionSourceIdentity,
	existingSpecs: readonly string[],
): string {
	const label =
		identity.kind === "npm" ? `npm package ${identity.value}` : `local path ${identity.value}`;
	return `Extension ${label} is already declared under a different source spec: ${existingSpecs.join(", ")}.`;
}

function findTopLevelExtensionsLine(lines: readonly string[]): number | undefined {
	let isInTable = false;
	for (let index = 0; index < lines.length; index += 1) {
		const rawLine = lines[index];
		if (rawLine === undefined) continue;
		const line = rawLine.trimStart();
		if (line === "" || line.startsWith("#")) continue;
		if (line.startsWith("[")) isInTable = true;
		if (!isInTable && /^extensions\s*=\s*\[/u.test(line)) return index;
	}
	return undefined;
}
