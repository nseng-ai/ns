import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ProjectConfigReadResult =
	| {
			kind: "found";
			projectName: string;
	  }
	| {
			kind: "missing";
	  }
	| {
			kind: "invalid";
	  }
	| {
			kind: "read_error";
			message?: string;
	  };

export interface VercelProjectConfigStore {
	readProjectConfig(params: { repoRoot: string }): Promise<ProjectConfigReadResult>;
}

type ReadTextFile = (path: string) => Promise<string>;

export class RealVercelProjectConfigStore implements VercelProjectConfigStore {
	private readonly readTextFile: ReadTextFile;

	constructor(readTextFile: ReadTextFile = async (path) => readFile(path, "utf8")) {
		this.readTextFile = readTextFile;
	}

	async readProjectConfig(params: { repoRoot: string }): Promise<ProjectConfigReadResult> {
		const projectJsonPath = join(params.repoRoot, ".vercel", "project.json");
		let content: string;
		try {
			content = await this.readTextFile(projectJsonPath);
		} catch (error) {
			if (isMissingFileError(error)) {
				return { kind: "missing" };
			}
			const message = error instanceof Error ? error.message : String(error);
			return { kind: "read_error", message };
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(content) as unknown;
		} catch {
			return { kind: "invalid" };
		}

		const record = asRecord(parsed);
		const projectName = record === undefined ? undefined : nonBlank(stringField(record, "projectName"));
		if (projectName === undefined) {
			return { kind: "invalid" };
		}
		return { kind: "found", projectName };
	}
}

export function projectConfigPath(repoRoot: string): string {
	return join(repoRoot, ".vercel", "project.json");
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function nonBlank(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
