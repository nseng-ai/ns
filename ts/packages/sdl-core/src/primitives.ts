import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function sha256Digest(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function truncatedSha256Digest(value: string): string {
	return sha256Digest(value).slice(0, 32);
}

export function mapFromRecordOrMap<T>(
	source: Readonly<Record<string, T>> | ReadonlyMap<string, T> | undefined,
): Map<string, T> {
	if (source === undefined) return new Map();
	if (source instanceof Map) return new Map(source);
	return new Map(Object.entries(source));
}
