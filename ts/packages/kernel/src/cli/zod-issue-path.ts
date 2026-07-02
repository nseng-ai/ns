import type { ZodIssueLike } from "@sdl/core/primitives";

/**
 * Kernel-local classifier for routing Zod issues by structural path shape.
 *
 * This intentionally stays private to `@sdl/kernel`: it is a small, policy-free
 * path-matching utility shared by `extension-discovery.ts` and
 * `command-registry.ts` to avoid raw `issue.path[N]` indexing at call sites.
 * It is not exported from the package and should not be promoted to
 * `@sdl/core/primitives` unless a second package needs it.
 */

export type ZodIssuePathPatternSegment = string | { readonly type: "number" };

export interface ZodIssuePathRule<T extends string> {
	readonly pattern: readonly ZodIssuePathPatternSegment[];
	readonly match: "exact" | "prefix";
	readonly value: T;
}

/**
 * Classify a single issue's path against a list of rules, returning the value
 * of the first matching rule or `fallback` if none match.
 */
export function classifyZodIssuePath<T extends string>(
	issue: ZodIssueLike | undefined,
	rules: readonly ZodIssuePathRule<T>[],
	fallback: T,
): T {
	if (issue === undefined) return fallback;
	for (const rule of rules) {
		if (zodIssuePathMatchesRule(issue.path, rule)) return rule.value;
	}
	return fallback;
}

/**
 * Classify a list of issues by scanning for the first issue whose path
 * matches any rule, rather than assuming `issues[0]` is the actionable one.
 */
export function classifyFirstMatchingZodIssuePath<T extends string>(
	issues: readonly ZodIssueLike[],
	rules: readonly ZodIssuePathRule<T>[],
	fallback: T,
): T {
	for (const issue of issues) {
		const kind = classifyZodIssuePath(issue, rules, fallback);
		if (kind !== fallback) return kind;
	}
	return fallback;
}

function zodIssuePathMatchesRule(
	path: readonly unknown[],
	rule: ZodIssuePathRule<string>,
): boolean {
	if (rule.match === "exact" && path.length !== rule.pattern.length) return false;
	if (rule.match === "prefix" && path.length < rule.pattern.length) return false;
	return rule.pattern.every((segment, index) => zodIssuePathSegmentMatches(segment, path[index]));
}

function zodIssuePathSegmentMatches(segment: ZodIssuePathPatternSegment, value: unknown): boolean {
	if (typeof segment === "string") return value === segment;
	return typeof value === "number";
}
