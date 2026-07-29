import type { ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import type { HerdrPiCommandApi } from "@nseng-ai/herdr/api";

export type { HerdrPiCommandApi } from "@nseng-ai/herdr/api";

export function createHerdrPiCommandApi(pi: ExtensionAPI): HerdrPiCommandApi {
	const adapted = Object.create(pi) as ExtensionAPI & HerdrPiCommandApi;
	Object.defineProperty(adapted, "exec", {
		value: createPiCommandExecApi(pi).exec,
	});
	return adapted;
}
