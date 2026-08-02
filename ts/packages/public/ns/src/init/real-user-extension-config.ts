import { dirname } from "node:path";
import { mkdir, open, readFile, stat, type FileHandle } from "node:fs/promises";

import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { mergeXdgHomeEnv, resolveNsXdgPath } from "@nseng-ai/foundation/xdg-path";

import type {
	ExpectedUserExtensionConfigState,
	UserExtensionConfigGateway,
	UserExtensionConfigReadResult,
	UserExtensionConfigWriteResult,
} from "./user-extension-config.ts";
import { userConfigPathError } from "./user-extension-config.ts";

export class RealUserExtensionConfigGateway implements UserExtensionConfigGateway {
	private readonly env: Record<string, string | undefined>;

	constructor(options: {
		readonly env: Record<string, string | undefined>;
		readonly homeDir?: string;
	}) {
		this.env = mergeXdgHomeEnv({
			baseEnv: options.env,
			...optionalEntry("xdgHomeDir", options.homeDir),
		});
	}

	async read(): Promise<UserExtensionConfigReadResult> {
		const resolved = resolveNsXdgPath({ kind: "config", env: this.env, segments: ["ns.toml"] });
		if (!resolved.ok) return userConfigPathError(resolved.error);
		const configPath = resolved.value;
		const configDir = dirname(configPath);
		try {
			const info = await stat(configPath);
			if (!info.isFile()) return { type: "not-file", configPath, configDir };
			return { type: "file", configPath, configDir, content: await readFile(configPath, "utf8") };
		} catch (error) {
			if (isNodeError(error, "ENOENT")) return { type: "missing", configPath, configDir };
			return {
				type: "error",
				configPath,
				error: {
					code: "user-config-read-failed",
					message: `Could not read user extension config ${configPath}: ${errorMessage(error)}`,
					path: configPath,
				},
			};
		}
	}

	async compareAndWrite(options: {
		readonly expected: ExpectedUserExtensionConfigState;
		readonly content: string;
	}): Promise<UserExtensionConfigWriteResult> {
		const current = await this.read();
		if (current.type === "error") {
			return {
				ok: false,
				error: {
					code: current.error.code,
					message: current.error.message,
					path: current.configPath ?? current.error.path ?? "user ns.toml",
				},
			};
		}
		if (current.type === "not-file") return mismatch(current.configPath);
		if (
			(options.expected.type === "missing" && current.type !== "missing") ||
			(options.expected.type === "file" &&
				(current.type !== "file" || current.content !== options.expected.content))
		) {
			return mismatch(current.configPath);
		}
		try {
			await mkdir(current.configDir, { recursive: true });
			if (options.expected.type === "missing") {
				const handle = await open(current.configPath, "wx");
				try {
					await handle.writeFile(options.content, "utf8");
				} finally {
					await handle.close();
				}
			} else {
				const handle = await open(current.configPath, "r+");
				try {
					const observed = await handle.readFile({ encoding: "utf8" });
					if (observed !== options.expected.content) return mismatch(current.configPath);
					await writeAll(handle, options.content);
				} finally {
					await handle.close();
				}
			}
			return { ok: true };
		} catch (error) {
			if (isNodeError(error, "EEXIST")) return mismatch(current.configPath);
			return {
				ok: false,
				error: {
					code: "user-config-write-failed",
					message: `Could not write user extension config ${current.configPath}: ${errorMessage(error)}`,
					path: current.configPath,
				},
			};
		}
	}
}

async function writeAll(handle: FileHandle, content: string): Promise<void> {
	const bytes = Buffer.from(content, "utf8");
	let offset = 0;
	while (offset < bytes.length) {
		const result = await handle.write(bytes, offset, bytes.length - offset, offset);
		if (result.bytesWritten === 0) throw new Error("Could not make progress writing user config.");
		offset += result.bytesWritten;
	}
	await handle.truncate(bytes.length);
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

function isNodeError(error: unknown, code: string): boolean {
	return error instanceof Error && "code" in error && error.code === code;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
