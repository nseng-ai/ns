import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";

import {
	DISPATCH_PACKAGE_MANIFEST_PATH,
	DISPATCH_SETTINGS_PATH,
} from "../../dispatch/harness-registry.ts";
import type { DispatchConfigGateway, DispatchConfigSourceResult } from "./contracts.ts";

export function createRealDispatchConfigGateway(): DispatchConfigGateway {
	return {
		async readDispatchSettingsSource({ repoRoot }) {
			return await readConfigSource(repoRoot, DISPATCH_SETTINGS_PATH);
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
