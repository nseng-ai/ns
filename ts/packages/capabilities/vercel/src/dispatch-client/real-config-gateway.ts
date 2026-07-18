import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type {
	ProjectConfigPathExistsResult,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config";

import { DISPATCH_PACKAGE_MANIFEST_PATH } from "../dispatch/harness-registry.ts";
import type { DispatchConfigGateway, DispatchConfigSourceResult } from "./contracts.ts";

export function createRealDispatchConfigGateway(): DispatchConfigGateway {
	return {
		readTextFile({ repoRoot, relativePath }): ProjectConfigReadResult {
			try {
				return { type: "found", text: readFileSync(join(repoRoot, relativePath), "utf8") };
			} catch (error) {
				if (errorCodeFromUnknown(error) === "ENOENT") return { type: "missing" };
				return { type: "error", message: formatErrorMessage(error) };
			}
		},
		pathExists({ repoRoot, relativePath }): ProjectConfigPathExistsResult {
			try {
				return existsSync(join(repoRoot, relativePath)) ? { type: "present" } : { type: "missing" };
			} catch (error) {
				return { type: "error", message: formatErrorMessage(error) };
			}
		},
		async readPackageManagerSource({ repoRoot }) {
			return await readConfigSource(repoRoot, DISPATCH_PACKAGE_MANIFEST_PATH);
		},
	};
}

async function readConfigSource(
	repoRoot: string,
	checkoutRelativePath: string,
): Promise<DispatchConfigSourceResult> {
	try {
		return {
			type: "found",
			source: await readFile(join(repoRoot, checkoutRelativePath), "utf8"),
		};
	} catch (error) {
		if (errorCodeFromUnknown(error) === "ENOENT") return { type: "missing" };
		return { type: "error", message: formatErrorMessage(error) };
	}
}
