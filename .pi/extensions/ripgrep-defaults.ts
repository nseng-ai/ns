import { fileURLToPath } from "node:url";

import type {
	RipgrepDefaultsEnvironment,
	RipgrepDefaultsExtensionApi,
} from "@nseng-ai/pi/search/ripgrep-defaults";

import { importTypeScriptWorkspaceModule } from "../lib/workspace-packages.ts";

const { registerRipgrepDefaultsExtension } = await importTypeScriptWorkspaceModule<
	typeof import("@nseng-ai/pi/search/ripgrep-defaults")
>("@nseng-ai/pi/search/ripgrep-defaults");
const configPath = fileURLToPath(new URL("../ripgrep.conf", import.meta.url));
const environment: RipgrepDefaultsEnvironment = {
	get: (name) => process.env[name],
	set: (name, value) => {
		process.env[name] = value;
	},
	delete: (name) => {
		delete process.env[name];
	},
};

export default function ripgrepDefaultsExtension(pi: RipgrepDefaultsExtensionApi): void {
	registerRipgrepDefaultsExtension(pi, { environment, configPath });
}
