const LOWERCASE_KEBAB_CASE_TOKEN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isLowercaseKebabCaseToken(value: string): boolean {
	return LOWERCASE_KEBAB_CASE_TOKEN_PATTERN.test(value);
}
