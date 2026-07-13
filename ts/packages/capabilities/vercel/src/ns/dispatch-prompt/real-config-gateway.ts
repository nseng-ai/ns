import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { errorCodeFromUnknown, formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type { DispatchConfigGateway } from "./contracts.ts";
import { DISPATCH_SETTINGS_FILE_NAME } from "./core.ts";

export function createRealDispatchConfigGateway(): DispatchConfigGateway {
	return {
		async readDispatchSettingsSource({ repoRoot }) {
			try {
				return {
					type: "found",
					source: await readFile(join(repoRoot, DISPATCH_SETTINGS_FILE_NAME), "utf8"),
				};
			} catch (error) {
				if (errorCodeFromUnknown(error) === "ENOENT") return { type: "missing" };
				return { type: "error", message: formatErrorMessage(error) };
			}
		},
	};
}
