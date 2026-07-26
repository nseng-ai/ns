import type { CommandExecApi } from "@nseng-ai/foundation/command";
import { createPiCommandExecApi } from "@nseng-ai/pi-runtime/shared/command-exec";
import type { ExtensionAPI } from "./host-types.ts";

export type BranchContextPiCommandApi = Omit<ExtensionAPI, "exec"> &
	CommandExecApi & { readonly rawPi: ExtensionAPI };

export function createBranchContextPiCommandApi(pi: ExtensionAPI): BranchContextPiCommandApi {
	const adapted = Object.create(pi) as BranchContextPiCommandApi;
	Object.defineProperties(adapted, {
		exec: { value: createPiCommandExecApi(pi).exec },
		rawPi: { value: pi },
	});
	return adapted;
}
