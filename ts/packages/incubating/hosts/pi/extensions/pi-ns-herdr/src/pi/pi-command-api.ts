import type { ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";

export type { HerdrPiCommandApi } from "../core/pi-command-api.ts";

export function createHerdrPiCommandApi(pi: ExtensionAPI): HerdrPiCommandApi {
	const adapted = Object.create(pi) as HerdrPiCommandApi;
	Object.defineProperty(adapted, "exec", {
		value: createPiCommandExecApi(pi).exec,
	});
	return adapted;
}
