export type ValidationResult = { type: "valid" } | { type: "invalid"; reason: string };

const KEY_FORBIDDEN_CHARS = new Set([" ", "~", "^", "?", "*", "[", "\\"]);
const KEY_SEGMENT_PATTERN = /^[^\x00-\x1f\x7f :?*[\\~^]+$/u;

export function valid(): ValidationResult {
	return { type: "valid" };
}

export function invalid(reason: string): ValidationResult {
	return { type: "invalid", reason };
}

export function validateEntryKey(key: string): ValidationResult {
	if (key.length === 0) return invalid("key must not be empty");
	if (key.startsWith("/")) return invalid("key must not start with '/'");
	if (key.endsWith("/")) return invalid("key must not end with '/'");
	if (key.includes("//")) return invalid("key must not contain '//'");
	if (key.includes(":")) return invalid("':' is not supported in keys");
	for (const character of key) {
		if (KEY_FORBIDDEN_CHARS.has(character))
			return invalid(`key contains forbidden character ${JSON.stringify(character)}`);
		const code = character.charCodeAt(0);
		if (code < 0x20 || code === 0x7f) return invalid("key contains a control character");
	}
	const segments = key.split("/");
	if (segments.some((segment) => segment === ".."))
		return invalid("key must not contain '..' segment");
	if (segments.some((segment) => segment.endsWith(".lock"))) {
		return invalid("key segment must not end with '.lock'");
	}
	for (const segment of segments) {
		if (!KEY_SEGMENT_PATTERN.test(segment)) {
			return invalid(`key segment ${JSON.stringify(segment)} is not in the allowed character set`);
		}
	}
	return valid();
}

export function validateNamespaceName(namespace: string): ValidationResult {
	if (namespace.length === 0) return invalid("namespace must not be empty");
	if (namespace.includes("/")) return invalid("namespace must not contain '/'");
	return valid();
}

export function validateBranchName(branch: string): ValidationResult {
	if (branch.length === 0) return invalid("branch name must not be empty");
	if (branch.includes("---"))
		return invalid("branch names containing '---' cannot be encoded into refs/brmem");
	return valid();
}

export function validateKeyGlob(pattern: string): ValidationResult {
	if (pattern.length === 0) return invalid("Entry Key glob must not be empty");
	for (const character of pattern) {
		if (character === "\0") return invalid("Entry Key glob must not contain NUL");
		if (character === "\n" || character === "\r")
			return invalid("Entry Key glob must not contain newline");
	}
	return valid();
}

export function validationMessage(
	kind: "branch name" | "namespace" | "key" | "Entry Key glob",
	value: string,
	result: ValidationResult,
): string | undefined {
	if (result.type === "valid") return undefined;
	const label = kind === "Entry Key glob" ? "Entry Key glob" : kind;
	return `Invalid ${label} ${JSON.stringify(value)}: ${result.reason}`;
}

export function firstFailure(
	...checks: readonly (readonly [errorType: string, message: string | undefined])[]
): readonly [errorType: string, message: string] | undefined {
	const failures = checks.filter(
		(check): check is readonly [string, string] => check[1] !== undefined,
	);
	if (failures.length === 0) return undefined;
	if (failures.length === 1) return failures[0];
	return [
		"invalid_request",
		["Invalid brmem request:", ...failures.map((failure) => `- ${failure[1]}`)].join("\n"),
	];
}
