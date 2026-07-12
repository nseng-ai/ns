import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
import { createPiCommandExecApi } from "@nseng-ai/pi/shared/command-exec";
import type { CccPiCommandApi } from "../core/pi-command-api.ts";

export type { CccPiCommandApi } from "../core/pi-command-api.ts";

export function createCccPiCommandApi(pi: ExtensionAPI): CccPiCommandApi {
	const adapted = Object.create(pi) as CccPiCommandApi;
	Object.defineProperty(adapted, "exec", {
		value: createPiCommandExecApi(pi).exec,
	});
	return adapted;
}
