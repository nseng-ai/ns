import { isRecord } from "../../ts/packages/pi-extension-runtime/src/cmux/primitives.ts";

const HOME_ROOT = "/Users/schrockn";
const BLOCK_REASON = "Blocked by home-directory-guard extension: home-directory root target is forbidden. Scope to a repo or explicit subfolder.";

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

interface UserBashEvent {
	command: string;
	excludeFromContext: boolean;
	cwd: string;
}

interface UserBashResult {
	result?: {
		output: string;
		exitCode: number;
		cancelled: boolean;
		truncated: boolean;
	};
}

interface ExtensionAPI {
	on(event: "tool_call", handler: ToolCallHandler): void;
	on(event: "user_bash", handler: (event: UserBashEvent) => UserBashResult | undefined | void): void;
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

	pi.on("user_bash", (event) => {
		if (commandTargetsHomeRoot(event.command)) {
			return {
				result: { output: BLOCK_REASON, exitCode: 1, cancelled: false, truncated: false },
			};
		}
		return undefined;
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
	let tokens: readonly string[] = [];
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
			tokens = appendToken(tokens, current);
			current = "";
			continue;
		}

		current += character;
	}

	return appendToken(tokens, current);
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
	return collectPathLikeValuesForKey(input, undefined);
}

function collectPathLikeValuesForKey(input: unknown, key: string | undefined): string[] {
	if (typeof input === "string") {
		return key !== undefined && isPathLikeKey(key) ? [input] : [];
	}

	if (Array.isArray(input)) {
		return input.flatMap((item) => collectPathLikeValuesForKey(item, key));
	}

	if (!isRecord(input)) return [];

	return Object.entries(input).flatMap(([childKey, childValue]) => {
		if (TEXT_CONTENT_KEYS.has(childKey)) return [];
		return collectPathLikeValuesForKey(childValue, childKey);
	});
}

function commandFromInput(input: unknown): string | undefined {
	if (!isRecord(input)) return undefined;
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

function appendToken(tokens: readonly string[], token: string): string[] {
	return token.length === 0 ? [...tokens] : [...tokens, token];
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
