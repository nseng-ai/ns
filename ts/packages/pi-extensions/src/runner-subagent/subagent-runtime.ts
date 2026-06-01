import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
	RunnerSubagentTerminalStatus,
	RunnerSubagentTerminalToolDefinition,
	TypeBoxLikeSchema,
} from "../runner-subagent.ts";

const RUNTIME_VERSION = 1;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RUNTIME_ROOT_PREFIX = "pi-runner-subagent-runtime-";

export interface RuntimeConfigV1 {
	version: 1;
	title?: string;
	terminalTools: Array<{
		name: string;
		status: RunnerSubagentTerminalStatus;
		description: string;
		parameters: TypeBoxLikeSchema;
	}>;
}

export type RuntimeResultV1 =
	| {
			version: 1;
			kind: "terminal-capture";
			toolName: string;
			toolCallId?: string;
			status: RunnerSubagentTerminalStatus;
			input: unknown;
	  }
	| {
			version: 1;
			kind: "runtime-error";
			code: "tool-collision" | "config-error" | "write-error";
			message: string;
	  };

export interface CreateRunnerSubagentRuntimeFilesInput {
	title?: string;
	terminalTools: readonly RunnerSubagentTerminalToolDefinition[];
}

export interface RunnerSubagentRuntimeFiles {
	runtimeDir: string;
	configPath: string;
	resultPath: string;
	extensionPath: string;
	cleanup?: () => Promise<void> | void;
}

export class RuntimeConfigValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RuntimeConfigValidationError";
	}
}

export class RuntimeResultParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RuntimeResultParseError";
	}
}

export function createRuntimeConfig(input: CreateRunnerSubagentRuntimeFilesInput): RuntimeConfigV1 {
	const terminalTools = validateTerminalToolDefinitions(input.terminalTools);
	return {
		version: RUNTIME_VERSION,
		...(input.title === undefined ? {} : { title: input.title }),
		terminalTools,
	};
}

export async function createDefaultRunnerSubagentRuntimeFiles(
	input: CreateRunnerSubagentRuntimeFilesInput,
): Promise<RunnerSubagentRuntimeFiles> {
	const config = createRuntimeConfig(input);
	const root = join(tmpdir(), RUNTIME_ROOT_PREFIX);
	await mkdir(root, { recursive: true, mode: 0o700 });
	const runtimeDir = await mkdtemp(join(root, "run-"));
	await chmod(runtimeDir, 0o700);

	const configPath = join(runtimeDir, "config.json");
	const resultPath = join(runtimeDir, "result.json");
	const extensionPath = join(runtimeDir, "runtime-extension.ts");
	const runtimeFactoryPath = fileURLToPath(new URL("./subagent-runtime-extension.ts", import.meta.url));

	try {
		await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		await writeFile(extensionPath, generatedRuntimeExtensionSource(runtimeFactoryPath, configPath, resultPath), {
			encoding: "utf8",
			mode: 0o600,
		});
	} catch (error) {
		await rm(runtimeDir, { recursive: true, force: true });
		throw error;
	}

	return {
		runtimeDir,
		configPath,
		resultPath,
		extensionPath,
		cleanup: async () => {
			await rm(runtimeDir, { recursive: true, force: true });
		},
	};
}

export function readRuntimeConfigFileSync(configPath: string): RuntimeConfigV1 {
	return parseRuntimeConfigJson(readFileSync(configPath, "utf8"));
}

export async function readRuntimeResultFile(resultPath: string): Promise<RuntimeResultV1 | undefined> {
	let raw: string;
	try {
		raw = await readFile(resultPath, "utf8");
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return undefined;
		throw error;
	}
	return parseRuntimeResultJson(raw);
}

export function writeRuntimeResultFileSync(resultPath: string, result: RuntimeResultV1): boolean {
	const raw = `${JSON.stringify(parseRuntimeResultValue(result))}\n`;
	let fd: number | undefined;
	try {
		fd = openSync(resultPath, "wx", 0o600);
		writeFileSync(fd, raw, "utf8");
		return true;
	} catch (error) {
		if (isNodeErrorCode(error, "EEXIST")) return false;
		throw error;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

export function parseRuntimeConfigJson(raw: string): RuntimeConfigV1 {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		throw new RuntimeConfigValidationError(`Invalid runner subagent runtime config JSON: ${errorMessage(error)}`);
	}
	return parseRuntimeConfigValue(value);
}

export function parseRuntimeConfigValue(value: unknown): RuntimeConfigV1 {
	if (!isRecord(value)) {
		throw new RuntimeConfigValidationError("Runner subagent runtime config must be an object.");
	}
	if (value.version !== RUNTIME_VERSION) {
		throw new RuntimeConfigValidationError("Unsupported runner subagent runtime config version.");
	}
	if (value.title !== undefined && typeof value.title !== "string") {
		throw new RuntimeConfigValidationError("Runner subagent runtime config title must be a string when present.");
	}
	if (!Array.isArray(value.terminalTools)) {
		throw new RuntimeConfigValidationError("Runner subagent runtime config terminalTools must be an array.");
	}
	return {
		version: RUNTIME_VERSION,
		...(value.title === undefined ? {} : { title: value.title }),
		terminalTools: validateTerminalToolDefinitions(value.terminalTools),
	};
}

export function parseRuntimeResultJson(raw: string): RuntimeResultV1 {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch (error) {
		throw new RuntimeResultParseError(`Invalid runner subagent runtime result JSON: ${errorMessage(error)}`);
	}
	return parseRuntimeResultValue(value);
}

export function parseRuntimeResultValue(value: unknown): RuntimeResultV1 {
	if (!isRecord(value)) {
		throw new RuntimeResultParseError("Runner subagent runtime result must be an object.");
	}
	if (value.version !== RUNTIME_VERSION) {
		throw new RuntimeResultParseError("Unsupported runner subagent runtime result version.");
	}
	if (value.kind === "terminal-capture") {
		if (typeof value.toolName !== "string" || value.toolName.length === 0) {
			throw new RuntimeResultParseError("Terminal capture result must include a toolName.");
		}
		if (!isTerminalStatus(value.status)) {
			throw new RuntimeResultParseError("Terminal capture result has an invalid status.");
		}
		if (value.toolCallId !== undefined && typeof value.toolCallId !== "string") {
			throw new RuntimeResultParseError("Terminal capture result toolCallId must be a string when present.");
		}
		if (!("input" in value)) {
			throw new RuntimeResultParseError("Terminal capture result must include input.");
		}
		return {
			version: RUNTIME_VERSION,
			kind: "terminal-capture",
			toolName: value.toolName,
			...(value.toolCallId === undefined ? {} : { toolCallId: value.toolCallId }),
			status: value.status,
			input: value.input,
		};
	}
	if (value.kind === "runtime-error") {
		if (!isRuntimeErrorCode(value.code)) {
			throw new RuntimeResultParseError("Runtime error result has an invalid code.");
		}
		if (typeof value.message !== "string" || value.message.length === 0) {
			throw new RuntimeResultParseError("Runtime error result must include a message.");
		}
		return {
			version: RUNTIME_VERSION,
			kind: "runtime-error",
			code: value.code,
			message: value.message,
		};
	}
	throw new RuntimeResultParseError("Runner subagent runtime result has an invalid kind.");
}

export function validateTerminalToolDefinitions(
	terminalTools: readonly unknown[],
): RuntimeConfigV1["terminalTools"] {
	if (terminalTools.length === 0) {
		throw new RuntimeConfigValidationError("At least one runner subagent terminal tool must be provided.");
	}

	const names = new Set<string>();
	return terminalTools.map((tool, index) => {
		if (!isRecord(tool)) {
			throw new RuntimeConfigValidationError(`Terminal tool at index ${index} must be an object.`);
		}
		if (typeof tool.name !== "string" || tool.name.length === 0) {
			throw new RuntimeConfigValidationError(`Terminal tool at index ${index} must have a non-empty name.`);
		}
		if (!TOOL_NAME_PATTERN.test(tool.name)) {
			throw new RuntimeConfigValidationError(
				`Terminal tool "${tool.name}" must match ${TOOL_NAME_PATTERN.toString()} for Pi custom tool names.`,
			);
		}
		if (names.has(tool.name)) {
			throw new RuntimeConfigValidationError(`Duplicate terminal tool name: ${tool.name}.`);
		}
		names.add(tool.name);
		if (!isTerminalStatus(tool.status)) {
			throw new RuntimeConfigValidationError(`Terminal tool "${tool.name}" has invalid status.`);
		}
		if (typeof tool.description !== "string" || tool.description.length === 0) {
			throw new RuntimeConfigValidationError(`Terminal tool "${tool.name}" must have a non-empty description.`);
		}
		if (!isRecord(tool.parameters)) {
			throw new RuntimeConfigValidationError(`Terminal tool "${tool.name}" parameters must be an object.`);
		}
		const parameters = cloneJsonSerializable(tool.parameters, `Terminal tool "${tool.name}" parameters`);
		return {
			name: tool.name,
			status: tool.status,
			description: tool.description,
			parameters,
		};
	});
}

function generatedRuntimeExtensionSource(runtimeFactoryPath: string, configPath: string, resultPath: string): string {
	return [
		`import { createRunnerSubagentRuntimeExtension } from ${JSON.stringify(runtimeFactoryPath)};`,
		"",
		"export default createRunnerSubagentRuntimeExtension({",
		`\tconfigPath: ${JSON.stringify(configPath)},`,
		`\tresultPath: ${JSON.stringify(resultPath)},`,
		"});",
		"",
	].join("\n");
}

function cloneJsonSerializable(value: unknown, label: string): TypeBoxLikeSchema {
	let raw: string | undefined;
	try {
		raw = JSON.stringify(value);
	} catch (error) {
		throw new RuntimeConfigValidationError(`${label} must be JSON-serializable: ${errorMessage(error)}`);
	}
	if (raw === undefined) {
		throw new RuntimeConfigValidationError(`${label} must be JSON-serializable.`);
	}
	return JSON.parse(raw) as TypeBoxLikeSchema;
}

function isTerminalStatus(value: unknown): value is RunnerSubagentTerminalStatus {
	return value === "completed" || value === "blocked";
}

function isRuntimeErrorCode(value: unknown): value is Extract<RuntimeResultV1, { kind: "runtime-error" }>["code"] {
	return value === "tool-collision" || value === "config-error" || value === "write-error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return isRecord(error) && error.code === code;
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
