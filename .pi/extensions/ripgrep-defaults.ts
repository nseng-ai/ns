import { fileURLToPath } from "node:url";

import {
	registerRipgrepDefaultsExtension,
	type RipgrepDefaultsExtensionApi,
} from "../../ts/packages/hosts/pi/src/kit/search/ripgrep-defaults.ts";

const configPath = fileURLToPath(new URL("../ripgrep.conf", import.meta.url));

export default function ripgrepDefaultsExtension(pi: RipgrepDefaultsExtensionApi): void {
	registerRipgrepDefaultsExtension(pi, {
		environment: process.env,
		configPath,
	});
}
