const HOME_ROOT = "/Users/schrockn";
const BLOCK_REASON = "Home-directory root target is forbidden. Scope to a repo or explicit subfolder.";

const PATH_LIKE_KEYS = new Set([
	"path",
	"paths",
	"file",
	"files",
	"filePath",
	"file_path",
	"cwd",
	"dir",
	"directory",
	"root",
]);

const TEXT_CONTENT_KEYS = new Set(["content", "oldText", "newText", "prompt", "summary", "query"]);

interface ExtensionAPI {
	on(event: "tool_call", handler: ToolCallHandler): void;
}

type ToolCallHandler = (event: ToolCallEvent) => ToolCallResult | undefined | void;

interface ToolCallEvent {
	toolName: string;
	input: unknown;
}

interface ToolCallResult {
	block: true;
	reason?: string;
}

interface HomeRootViolation {
	reason: string;
}

export default function homeDirectoryGuardExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		const violation = findHomeRootTarget(event);
		if (violation === undefined) return undefined;
		return { block: true, reason: violation.reason };
	});
}

export function findHomeRootTarget(event: ToolCallEvent): HomeRootViolation | undefined {
	if (event.toolName === "bash") {
		const command = commandFromInput(event.input);
		if (command !== undefined && commandTargetsHomeRoot(command)) return { reason: BLOCK_REASON };
		return undefined;
	}

	const pathValues = collectPathLikeValues(event.input);
	if (pathValues.some(pathValueTargetsHomeRoot)) return { reason: BLOCK_REASON };
	return undefined;
}

export function commandTargetsHomeRoot(command: string): boolean {
	// This is a direct-target guard for common model-generated commands, not an adversarial shell sandbox.
	return tokenizeShellLikeCommand(command).some(tokenTargetsHomeRoot);
}

export function tokenizeShellLikeCommand(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;

	for (let index = 0; index < command.length; index += 1) {
		const character = command[index];
		if (character === undefined) continue;

		if (quote !== undefined) {
			if (character === quote) {
				quote = undefined;
			} else {
				current += character;
			}
			continue;
		}

		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}

		if (isShellTokenSeparator(character)) {
			pushToken(tokens, current);
			current = "";
			continue;
		}

		current += character;
	}

	pushToken(tokens, current);
	return tokens;
}

export function pathValueTargetsHomeRoot(value: string): boolean {
	const normalized = stripSimpleMatchingQuotes(value.trim());
	if (normalized.length === 0) return false;

	if (normalized === HOME_ROOT || normalized === `${HOME_ROOT}/`) return true;
	if (normalized === "~" || normalized === "~/") return true;
	if (normalized === "$HOME" || normalized === "$HOME/") return true;
	if (normalized === "${HOME}" || normalized === "${HOME}/") return true;

	return false;
}

export function collectPathLikeValues(input: unknown): string[] {
	const values: string[] = [];
	collectPathLikeValuesInto(input, undefined, values);
	return values;
}

function collectPathLikeValuesInto(input: unknown, key: string | undefined, values: string[]): void {
	if (typeof input === "string") {
		if (key !== undefined && isPathLikeKey(key)) values.push(input);
		return;
	}

	if (Array.isArray(input)) {
		for (const item of input) {
			collectPathLikeValuesInto(item, key, values);
		}
		return;
	}

	if (!isPlainObject(input)) return;

	for (const [childKey, childValue] of Object.entries(input)) {
		if (TEXT_CONTENT_KEYS.has(childKey)) continue;
		collectPathLikeValuesInto(childValue, childKey, values);
	}
}

function commandFromInput(input: unknown): string | undefined {
	if (!isPlainObject(input)) return undefined;
	const command = input.command;
	return typeof command === "string" ? command : undefined;
}

function tokenTargetsHomeRoot(token: string): boolean {
	if (pathValueTargetsHomeRoot(token)) return true;

	if (!token.startsWith("-")) return false;

	const valueStart = token.lastIndexOf("=");
	if (valueStart === -1) return false;

	const value = token.slice(valueStart + 1);
	return pathValueTargetsHomeRoot(value);
}

function isShellTokenSeparator(character: string): boolean {
	return /\s/.test(character) || character === ";" || character === "&" || character === "|" || character === "<" || character === ">";
}

function pushToken(tokens: string[], token: string): void {
	if (token.length === 0) return;
	tokens.push(token);
}

function stripSimpleMatchingQuotes(value: string): string {
	if (value.length < 2) return value;

	const first = value[0];
	const last = value[value.length - 1];
	if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
		return value.slice(1, -1).trim();
	}

	return value;
}

function isPathLikeKey(key: string): boolean {
	return PATH_LIKE_KEYS.has(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
