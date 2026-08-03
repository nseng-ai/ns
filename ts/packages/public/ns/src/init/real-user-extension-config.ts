import { randomUUID } from "node:crypto";
import { dirname, basename, join } from "node:path";
import { lstat, mkdir, open, readFile, rename, unlink, type FileHandle } from "node:fs/promises";

import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { mergeXdgHomeEnv, resolveNsXdgPath } from "@nseng-ai/foundation/xdg-path";

import type {
	ExpectedUserExtensionConfigState,
	UserExtensionConfigGateway,
	UserExtensionConfigReadResult,
	UserExtensionConfigWriteResult,
} from "./user-extension-config.ts";
import { userConfigPathError } from "./user-extension-config.ts";

export interface UserExtensionConfigFileInfo {
	readonly type: "file" | "symlink" | "other";
	readonly mode: number;
}

export interface UserExtensionConfigWritableFile {
	write(buffer: Uint8Array, offset: number, length: number, position: number): Promise<number>;
	sync(): Promise<void>;
	close(): Promise<void>;
}

export interface UserExtensionConfigFileOps {
	lstat(path: string): Promise<UserExtensionConfigFileInfo>;
	readFile(path: string): Promise<string>;
	mkdir(path: string): Promise<void>;
	openExclusive(path: string, mode: number): Promise<UserExtensionConfigWritableFile>;
	rename(fromPath: string, toPath: string): Promise<void>;
	unlink(path: string): Promise<void>;
	syncDirectory(path: string): Promise<void>;
	tempName(): string;
}

interface InspectedConfig {
	readonly result: UserExtensionConfigReadResult;
	readonly mode?: number;
}

const realFileOps: UserExtensionConfigFileOps = {
	async lstat(path) {
		const info = await lstat(path);
		return {
			type: info.isSymbolicLink() ? "symlink" : info.isFile() ? "file" : "other",
			mode: info.mode,
		};
	},
	readFile: (path) => readFile(path, "utf8"),
	mkdir: async (path) => {
		await mkdir(path, { recursive: true });
	},
	async openExclusive(path, mode) {
		return nodeWritableFile(await open(path, "wx", mode));
	},
	rename,
	unlink,
	async syncDirectory(path) {
		const handle = await open(path, "r");
		try {
			await handle.sync();
		} finally {
			await handle.close();
		}
	},
	tempName: randomUUID,
};

export class RealUserExtensionConfigGateway implements UserExtensionConfigGateway {
	private readonly env: Record<string, string | undefined>;
	private readonly fileOps: UserExtensionConfigFileOps;

	constructor(options: {
		readonly env: Record<string, string | undefined>;
		readonly homeDir?: string;
		readonly fileOps?: UserExtensionConfigFileOps;
	}) {
		this.env = mergeXdgHomeEnv({
			baseEnv: options.env,
			...optionalEntry("xdgHomeDir", options.homeDir),
		});
		this.fileOps = options.fileOps ?? realFileOps;
	}

	async read(): Promise<UserExtensionConfigReadResult> {
		const resolved = resolveNsXdgPath({ kind: "config", env: this.env, segments: ["ns.toml"] });
		if (!resolved.ok) return userConfigPathError(resolved.error);
		return (await this.inspect(resolved.value)).result;
	}

	async compareAndWrite(options: {
		readonly expected: ExpectedUserExtensionConfigState;
		readonly content: string;
	}): Promise<UserExtensionConfigWriteResult> {
		const resolved = resolveNsXdgPath({ kind: "config", env: this.env, segments: ["ns.toml"] });
		if (!resolved.ok) {
			const pathError = userConfigPathError(resolved.error);
			if (pathError.type !== "error") throw new Error("Expected a user config path error.");
			return {
				ok: false,
				error: {
					code: pathError.error.code,
					message: pathError.error.message,
					path: pathError.error.path ?? "user ns.toml",
				},
			};
		}

		const configPath = resolved.value;
		const configDir = dirname(configPath);
		const current = await this.inspect(configPath);
		if (current.result.type === "error") return readFailureAsWriteFailure(current.result);
		if (!matchesExpected(current.result, options.expected)) return mismatch(configPath);

		let tempPath: string | undefined;
		let renamed = false;
		try {
			await this.fileOps.mkdir(configDir);
			tempPath = join(configDir, `.${basename(configPath)}.${this.fileOps.tempName()}.tmp`);
			const mode = current.mode === undefined ? 0o600 : current.mode & 0o7777;
			const handle = await this.fileOps.openExclusive(tempPath, mode);
			try {
				await writeAll(handle, options.content);
				await handle.sync();
			} finally {
				await handle.close();
			}

			// This final prepared-state check is intentionally best-effort. Portable rename
			// offers no pathname compare-and-swap, so another writer can still race between
			// this check and rename; temp+rename prevents torn bytes, not concurrent writers.
			const finalCheck = await this.inspect(configPath);
			if (finalCheck.result.type === "error") {
				await cleanupTemp(this.fileOps, tempPath);
				return readFailureAsWriteFailure(finalCheck.result);
			}
			if (!matchesExpected(finalCheck.result, options.expected)) {
				await cleanupTemp(this.fileOps, tempPath);
				return mismatch(configPath);
			}

			await this.fileOps.rename(tempPath, configPath);
			renamed = true;
			try {
				await this.fileOps.syncDirectory(configDir);
			} catch (error) {
				return {
					ok: false,
					error: {
						code: "user-config-write-failed",
						message: `Could not durably finish writing user extension config ${configPath}; the replacement may already be visible: ${errorMessage(error)}`,
						path: configPath,
					},
				};
			}
			return { ok: true };
		} catch (error) {
			if (!renamed && tempPath !== undefined) await cleanupTemp(this.fileOps, tempPath);
			if (isNodeError(error, "EEXIST")) return mismatch(configPath);
			return writeFailure(configPath, error);
		}
	}

	private async inspect(configPath: string): Promise<InspectedConfig> {
		const configDir = dirname(configPath);
		try {
			const info = await this.fileOps.lstat(configPath);
			if (info.type === "symlink") {
				return {
					result: {
						type: "error",
						configPath,
						error: {
							code: "user-config-symlink-unsupported",
							message: `User extension config must not be a symbolic link: ${configPath}.`,
							path: configPath,
						},
					},
				};
			}
			if (info.type !== "file") {
				return { result: { type: "not-file", configPath, configDir } };
			}
			return {
				result: {
					type: "file",
					configPath,
					configDir,
					content: await this.fileOps.readFile(configPath),
				},
				mode: info.mode,
			};
		} catch (error) {
			if (isNodeError(error, "ENOENT")) {
				return { result: { type: "missing", configPath, configDir } };
			}
			return {
				result: {
					type: "error",
					configPath,
					error: {
						code: "user-config-read-failed",
						message: `Could not read user extension config ${configPath}: ${errorMessage(error)}`,
						path: configPath,
					},
				},
			};
		}
	}
}

function nodeWritableFile(handle: FileHandle): UserExtensionConfigWritableFile {
	return {
		async write(buffer, offset, length, position) {
			return (await handle.write(buffer, offset, length, position)).bytesWritten;
		},
		sync: () => handle.sync(),
		close: () => handle.close(),
	};
}

async function writeAll(handle: UserExtensionConfigWritableFile, content: string): Promise<void> {
	const bytes = Buffer.from(content, "utf8");
	let offset = 0;
	while (offset < bytes.length) {
		const bytesWritten = await handle.write(bytes, offset, bytes.length - offset, offset);
		if (bytesWritten === 0) throw new Error("Could not make progress writing user config.");
		offset += bytesWritten;
	}
}

async function cleanupTemp(fileOps: UserExtensionConfigFileOps, tempPath: string): Promise<void> {
	try {
		await fileOps.unlink(tempPath);
	} catch {
		// Preserve the operation's actionable failure when best-effort temp cleanup also fails.
	}
}

function matchesExpected(
	current: UserExtensionConfigReadResult,
	expected: ExpectedUserExtensionConfigState,
): boolean {
	return expected.type === "missing"
		? current.type === "missing"
		: current.type === "file" && current.content === expected.content;
}

function readFailureAsWriteFailure(
	failure: Extract<UserExtensionConfigReadResult, { readonly type: "error" }>,
): UserExtensionConfigWriteResult {
	return {
		ok: false,
		error: {
			code: failure.error.code,
			message: failure.error.message,
			path: failure.configPath ?? failure.error.path ?? "user ns.toml",
		},
	};
}

function mismatch(path: string): UserExtensionConfigWriteResult {
	return {
		ok: false,
		error: {
			code: "user-config-prepared-state-mismatch",
			message: `User extension config changed after preparation; refusing to overwrite ${path}.`,
			path,
		},
	};
}

function writeFailure(path: string, error: unknown): UserExtensionConfigWriteResult {
	return {
		ok: false,
		error: {
			code: "user-config-write-failed",
			message: `Could not write user extension config ${path}: ${errorMessage(error)}`,
			path,
		},
	};
}

function isNodeError(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
