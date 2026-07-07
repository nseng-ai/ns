import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

export type MaybePromise<T> = T | Promise<T>;

declare const explicitUndefinedReason: unique symbol;

export type ExplicitUndefinedReason =
	| "abort-signal"
	| "di-seam"
	| "env-map"
	| "external-mirror"
	| "key-event"
	| "null-tolerant-input"
	| "overload-selector"
	| "public-api-compatibility";

export type ExplicitUndefined<Reason extends ExplicitUndefinedReason, T> =
	| T
	| undefined
	| (never & { readonly [explicitUndefinedReason]: Reason });

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type TextResult =
	| {
			ok: true;
			text: string;
	  }
	| {
			ok: false;
			message: string;
	  };

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function finiteNumberField(
	record: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringArrayField(
	record: Record<string, unknown>,
	key: string,
): readonly string[] | undefined {
	const value = record[key];
	if (!Array.isArray(value)) return undefined;
	return value.every((item): item is string => typeof item === "string") ? value : undefined;
}

export type OptionalEntries<T extends Record<string, unknown>> = {
	[P in keyof T]?: Exclude<T[P], undefined>;
};

export function optionalEntries<T extends Record<string, unknown>>(entries: T): OptionalEntries<T> {
	return Object.fromEntries(
		Object.entries(entries).filter(([, value]) => value !== undefined),
	) as OptionalEntries<T>;
}

export function optionalEntry<K extends string, T>(key: K, value: T | undefined): { [P in K]?: T } {
	return optionalEntries({ [key]: value }) as { [P in K]?: T };
}

export function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function errorCodeFromUnknown(value: unknown): string | number | undefined {
	if (!isRecord(value)) return undefined;
	const code = value.code;
	return typeof code === "string" || typeof code === "number" ? code : undefined;
}

export interface ZodIssueLike {
	readonly path: readonly unknown[];
	readonly message: string;
}

export interface ZodErrorLike {
	readonly issues: readonly ZodIssueLike[];
}

export interface FormatZodIssueOptions {
	readonly rootPath?: string | null;
	readonly pathPrefix?: string;
	readonly fallback?: string;
}

export interface FormatZodErrorOptions extends FormatZodIssueOptions {
	readonly issueSeparator?: string;
}

export function formatZodIssue(
	issue: ZodIssueLike | undefined,
	options: FormatZodIssueOptions = {},
): string {
	if (issue === undefined) return options.fallback ?? "invalid value";
	if (issue.path.length === 0 && options.rootPath === null) return issue.message;
	const path =
		issue.path.length === 0
			? (options.rootPath ?? "<root>")
			: `${options.pathPrefix ?? ""}${issue.path.map((segment) => String(segment)).join(".")}`;
	return `${path}: ${issue.message}`;
}

export function formatZodError(error: ZodErrorLike, options: FormatZodErrorOptions = {}): string {
	if (error.issues.length === 0) return formatZodIssue(undefined, options);
	return error.issues
		.map((issue) => formatZodIssue(issue, options))
		.join(options.issueSeparator ?? "; ");
}

export function isPathInside(parent: string, child: string): boolean {
	const relativePath = relative(resolve(parent), resolve(child));
	return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function sha256Digest(value: string | Uint8Array): string {
	const hash = createHash("sha256");
	if (typeof value === "string") hash.update(value, "utf8");
	else hash.update(value);
	return hash.digest("hex");
}

export function truncatedSha256Digest(value: string): string {
	return sha256Digest(value).slice(0, 32);
}

export function buildFencedTextBlock(content: string, language = "text"): string {
	const longestBacktickRun = Math.max(
		0,
		...Array.from(content.matchAll(/`+/g), (match) => match[0]?.length ?? 0),
	);
	const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
	return `${fence}${language}\n${content}\n${fence}`;
}

export function mapFromRecordOrMap<T>(
	source: Readonly<Record<string, T>> | ReadonlyMap<string, T> | undefined,
): Map<string, T> {
	if (source === undefined) return new Map();
	if (source instanceof Map) return new Map(source);
	return new Map(Object.entries(source));
}
