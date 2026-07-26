const PYPI_NAME_PATTERN = /^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9])$/;
const PYPI_NORMALIZATION_PATTERN = /[-_.]+/g;
const NPM_UNSCOPED_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const NPM_RESERVED_NAMES = new Set(["node_modules", "favicon.ico"]);
const NPM_MAX_NAME_LENGTH = 214;
const BREW_FORMULA_NAME_PATTERN = /^[a-z0-9][a-z0-9@+._-]*$/;

export function normalizePypiName(packageName: string): string {
	return packageName.replaceAll(PYPI_NORMALIZATION_PATTERN, "-").toLowerCase();
}

export function pypiValidationError(packageName: string): string | null {
	if (packageName === "") return "PyPI package name must not be empty";
	if (!PYPI_NAME_PATTERN.test(packageName)) {
		return "PyPI package names must contain only ASCII letters, digits, '.', '_', or '-', and must start and end with a letter or digit";
	}
	return null;
}

export function npmValidationError(packageName: string): string | null {
	if (packageName === "") return "npm package name must not be empty";
	if (packageName.length > NPM_MAX_NAME_LENGTH) {
		return "npm package names must be 214 characters or fewer";
	}
	if (packageName.startsWith("@")) return scopedValidationError(packageName);
	if (packageName.includes("/")) return "npm unscoped package names must not contain '/'";
	return segmentValidationError(packageName);
}

function scopedValidationError(packageName: string): string | null {
	const body = packageName.slice(1);
	if (!body.includes("/")) return "npm scoped package names must have the form '@scope/name'";
	const parts = body.split("/");
	const scope = parts[0] ?? "";
	const name = parts[1] ?? "";
	if (parts.length > 2) return "npm scoped package names must not contain more than one '/'";
	if (scope === "") return "npm scoped package names must have a non-empty scope";
	if (name === "") return "npm scoped package names must have a non-empty name";
	const scopeError = segmentValidationError(scope);
	if (scopeError !== null) return `npm scope: ${scopeError}`;
	const nameError = segmentValidationError(name);
	if (nameError !== null) return `npm package: ${nameError}`;
	return null;
}

function segmentValidationError(segment: string): string | null {
	if (NPM_RESERVED_NAMES.has(segment)) return `'${segment}' is reserved by npm`;
	if (segment.toLowerCase() !== segment) return "npm package names must be lowercase";
	if (!NPM_UNSCOPED_NAME_PATTERN.test(segment)) {
		return "npm package names must contain only lowercase letters, digits, '.', '_', or '-', and must start with a lowercase letter or digit";
	}
	return null;
}

export function brewFormulaValidationError(packageName: string): string | null {
	if (packageName === "") return "Homebrew formula name must not be empty";
	if (!BREW_FORMULA_NAME_PATTERN.test(packageName)) {
		return "Homebrew formula names must contain only lowercase letters, digits, '.', '_', '-', '+', or '@', and must start with a lowercase letter or digit";
	}
	return null;
}
