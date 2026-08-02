import { link, mkdir, open, rm, rmdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { CreateArtifactRequest, CreateArtifactResult } from "../core/index.ts";

export interface NodeArtifactGatewayHooks {
	readonly beforePublish?: (temporaryPath: string) => Promise<void>;
}
export class NodeArtifactGateway {
	private readonly hooks: NodeArtifactGatewayHooks;
	constructor(hooks: NodeArtifactGatewayHooks = {}) {
		this.hooks = hooks;
	}
	async createArtifact(request: CreateArtifactRequest): Promise<CreateArtifactResult> {
		const parent = path.dirname(request.directory);
		try {
			const facts = await stat(parent);
			if (!facts.isDirectory()) return { type: "parent-missing" };
		} catch (error) {
			return isCode(error, "ENOENT") ? { type: "parent-missing" } : operationError(error);
		}
		try {
			await mkdir(request.directory);
		} catch (error) {
			return isCode(error, "EEXIST") ? { type: "target-exists" } : operationError(error);
		}
		const temporaryPath = path.join(
			request.directory,
			`.gitplane-artifact.json.${process.pid}.tmp`,
		);
		try {
			const file = await open(temporaryPath, "wx");
			try {
				await file.writeFile(request.marker, "utf8");
				await file.sync();
			} finally {
				await file.close();
			}
			await this.hooks.beforePublish?.(temporaryPath);
			const markerPath = path.join(request.directory, "gitplane-artifact.json");
			await link(temporaryPath, markerPath);
			await unlink(temporaryPath).catch(() => undefined);
			return { type: "created", directory: request.directory, artifactId: request.artifactId };
		} catch (error) {
			await rm(temporaryPath, { force: true }).catch(() => undefined);
			// The invocation owns the directory entry, but not content concurrently added to it.
			await rmdir(request.directory).catch(() => undefined);
			return operationError(error);
		}
	}
}
function isCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
function operationError(error: unknown): CreateArtifactResult {
	return {
		type: "error",
		error: {
			code: "filesystem-error",
			message: error instanceof Error ? error.message : String(error),
		},
	};
}
