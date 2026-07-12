import { resolve } from "node:path";

import { firstLineEnding } from "@nseng-ai/foundation/markdown-frontmatter";

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

export type NsTomlExtensionUninstallPlan =
	| {
			readonly ok: true;
			readonly text: string;
			readonly isRemoved: boolean;
			readonly matchedSpec: string | undefined;
	  }
	| {
			readonly ok: false;
			readonly reason: "invalid-toml" | "invalid-extensions" | "unsupported-format";
			readonly message: string;
	  }
	| {
			readonly ok: false;
			readonly reason: "ambiguous-identity";
			readonly identity: ExtensionSourceIdentity;
			readonly requestedSpec: string;
			readonly matchingSpecs: readonly string[];
			readonly message: string;
	  }
	| {
			readonly ok: false;
			readonly reason: "invalid-source";
			readonly requestedSpec: string;
			readonly message: string;
	  };

export function planDeclaredExtensionUninstallToml(options: {
	readonly projectRoot: string;
	readonly source: string;
	readonly requestedSpec: string;
}): NsTomlExtensionUninstallPlan {
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
	const matches = parsed.specs
		.map((spec, index) => ({ spec, index }))
		.filter(({ spec }) =>
			identitiesEqual(identity, extensionSourceIdentity(options.projectRoot, spec)),
		);
	if (matches.length === 0) {
		return { ok: true, text: options.source, isRemoved: false, matchedSpec: undefined };
	}
	if (matches.length > 1) {
		const matchingSpecs = matches.map(({ spec }) => spec);
		return {
			ok: false,
			reason: "ambiguous-identity",
			identity,
			requestedSpec: options.requestedSpec,
			matchingSpecs,
			message: `Extension identity is declared more than once and cannot be removed unambiguously: ${matchingSpecs.join(", ")}.`,
		};
	}
	const match = matches[0];
	if (match === undefined) throw new Error("Expected one matching extension declaration.");
	const replacement = removeExtensionArrayValue(options.source, match.index, parsed.specs.length);
	if (replacement === undefined) {
		return {
			ok: false,
			reason: "unsupported-format",
			message:
				"Top-level ns.toml extensions assignment must be a textual array before an extension can be uninstalled.",
		};
	}
	return { ok: true, text: replacement, isRemoved: true, matchedSpec: match.spec };
}

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
	const scan = scanExtensionsArray(source, openOffset);
	if (scan === undefined) return undefined;
	const closeLineIndex = offsets.findIndex(
		(offset, index) =>
			scan.closeOffset >= offset && scan.closeOffset < offset + (lines[index]?.length ?? 0),
	);
	if (closeLineIndex === -1) return undefined;
	return appendBeforeArrayClose({
		source,
		lines,
		startIndex,
		closeLineIndex,
		spec,
		scan,
	});
}

function appendBeforeArrayClose(options: {
	readonly source: string;
	readonly lines: readonly string[];
	readonly startIndex: number;
	readonly closeLineIndex: number;
	readonly spec: string;
	readonly scan: ExtensionsArrayScan;
}): string {
	const offsets = lineStartOffsets(options.lines);
	const closeLineOffset = offsets[options.closeLineIndex] ?? 0;
	const closeOffset = options.scan.closeOffset;
	const encodedSpec = JSON.stringify(options.spec);
	if (options.closeLineIndex === options.startIndex) {
		const separator =
			options.scan.lastValueEnd === undefined || options.scan.hasTrailingComma ? "" : ",";
		const trailingComma = options.scan.hasTrailingComma ? "," : "";
		return `${options.source.slice(0, closeOffset)}${separator} ${encodedSpec}${trailingComma}${options.source.slice(closeOffset)}`;
	}
	const closeLine = options.lines[options.closeLineIndex] ?? "";
	const closeIndent = closeLine.match(/^\s*/u)?.[0] ?? "";
	const itemIndent =
		options.scan.lastValueStart === undefined
			? `${closeIndent}\t`
			: indentationAt(options.source, options.scan.lastValueStart);
	const trailingComma = options.scan.hasTrailingComma ? "," : "";
	const lineEnding = firstLineEnding(options.source) ?? "\n";
	let next = `${options.source.slice(0, closeLineOffset)}${itemIndent}${encodedSpec}${trailingComma}${lineEnding}${options.source.slice(closeLineOffset)}`;
	if (options.scan.lastValueEnd !== undefined && !options.scan.hasTrailingComma) {
		next = `${next.slice(0, options.scan.lastValueEnd)},${next.slice(options.scan.lastValueEnd)}`;
	}
	return next;
}

interface ExtensionsArrayValueScan {
	readonly start: number;
	readonly end: number;
	readonly commaBefore: number | undefined;
	readonly commaAfter: number | undefined;
}

interface ExtensionsArrayScan {
	readonly closeOffset: number;
	readonly values: readonly ExtensionsArrayValueScan[];
	readonly lastValueStart: number | undefined;
	readonly lastValueEnd: number | undefined;
	readonly hasTrailingComma: boolean;
}

function removeExtensionArrayValue(
	source: string,
	valueIndex: number,
	expectedValueCount: number,
): string | undefined {
	const lines = source.split(/(?<=\n)/u);
	const offsets = lineStartOffsets(lines);
	const startIndex = findTopLevelExtensionsLine(lines);
	if (startIndex === undefined) return undefined;
	const startLine = lines[startIndex];
	if (startLine === undefined) return undefined;
	const equalsIndex = startLine.indexOf("=");
	const openIndex = startLine.indexOf("[", equalsIndex);
	if (equalsIndex === -1 || openIndex === -1) return undefined;
	const scan = scanExtensionsArray(source, (offsets[startIndex] ?? 0) + openIndex);
	if (scan === undefined || scan.values.length !== expectedValueCount) return undefined;
	const value = scan.values[valueIndex];
	if (value === undefined) return undefined;
	const comma = value.commaAfter ?? value.commaBefore;
	if (comma === undefined) return `${source.slice(0, value.start)}${source.slice(value.end)}`;
	if (comma < value.start) {
		return `${source.slice(0, comma)}${source.slice(comma + 1, value.start)}${source.slice(value.end)}`;
	}
	return `${source.slice(0, value.start)}${source.slice(value.end, comma)}${source.slice(comma + 1)}`;
}

function scanExtensionsArray(source: string, openOffset: number): ExtensionsArrayScan | undefined {
	if (openOffset < 0 || source[openOffset] !== "[") return undefined;
	let depth = 1;
	let quote: '"' | "'" | undefined;
	let isEscaped = false;
	let isComment = false;
	let valueStart: number | undefined;
	let lastValueStart: number | undefined;
	let lastValueEnd: number | undefined;
	let hasTrailingComma = false;
	let commaBefore: number | undefined;
	const values: ExtensionsArrayValueScan[] = [];
	for (let index = openOffset + 1; index < source.length; index += 1) {
		const char = source[index];
		if (char === "\n") {
			if (isComment) isComment = false;
			continue;
		}
		if (isComment) continue;
		if (quote !== undefined) {
			if (quote === '"' && char === "\\" && !isEscaped) {
				isEscaped = true;
				continue;
			}
			if (char === quote && !isEscaped) {
				if (depth === 1 && valueStart !== undefined) {
					lastValueStart = valueStart;
					lastValueEnd = index + 1;
					values.push({
						start: valueStart,
						end: index + 1,
						commaBefore,
						commaAfter: undefined,
					});
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
				return {
					closeOffset: index,
					values,
					lastValueStart,
					lastValueEnd,
					hasTrailingComma,
				};
			}
			continue;
		}
		if (depth === 1 && char === "," && lastValueEnd !== undefined) {
			hasTrailingComma = true;
			const lastValue = values.at(-1);
			if (lastValue !== undefined && lastValue.commaAfter === undefined) {
				values[values.length - 1] = { ...lastValue, commaAfter: index };
			}
			commaBefore = index;
		}
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
