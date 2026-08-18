import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import type { ExtensionAPI } from "./host-types.ts";

export interface GsPiCommandApi extends CommandExecApi {
	readonly rawPi: ExtensionAPI;
}

export function createGsPiCommandApi(pi: ExtensionAPI): GsPiCommandApi {
	return { exec: createPiCommandExecApi(pi).exec, rawPi: pi };
}
