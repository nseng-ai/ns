import { dirname } from "node:path";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

export const SLOT_CD_DIRECTIVE_FILE = "SLOT_CD_DIRECTIVE_FILE";

export type CdDirectiveResult =
	| { status: "inactive"; path: string | null }
	| { status: "written"; path: string }
	| { status: "failed"; path: string; error: string };

export interface CdDirectiveFilesystem {
	parentDirExists(path: string): Promise<boolean>;
	writeFile(path: string, content: string): Promise<void>;
}

export interface CdDirectiveOptions {
	isEnabled?: boolean | undefined;
	env?: NodeJS.ProcessEnv | undefined;
	filesystem?: CdDirectiveFilesystem | undefined;
}

export class RealCdDirectiveFilesystem implements CdDirectiveFilesystem {
	async parentDirExists(path: string): Promise<boolean> {
		return existsSync(dirname(path));
	}

	async writeFile(path: string, content: string): Promise<void> {
		await writeFile(path, content, "utf8");
	}
}

export function activeCdDirectivePath(env: NodeJS.ProcessEnv = process.env): string | null {
	const path = env[SLOT_CD_DIRECTIVE_FILE];
	if (path === undefined || path === "") return null;
	return path;
}

export async function writeCdDirectiveIfActive(destination: string, options: CdDirectiveOptions = {}): Promise<CdDirectiveResult> {
	const directivePath = activeCdDirectivePath(options.env ?? process.env);
	if (options.isEnabled === false || directivePath === null) return { status: "inactive", path: directivePath };
	const filesystem = options.filesystem ?? new RealCdDirectiveFilesystem();
	if (!(await filesystem.parentDirExists(directivePath))) {
		return { status: "failed", path: directivePath, error: `parent directory does not exist: ${dirname(directivePath)}` };
	}
	try {
		await filesystem.writeFile(directivePath, destination);
		return { status: "written", path: directivePath };
	} catch (error) {
		return { status: "failed", path: directivePath, error: error instanceof Error ? error.message : String(error) };
	}
}
