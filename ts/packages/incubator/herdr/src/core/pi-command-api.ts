import type { ExtensionAPI } from "@nseng-ai/extension-kit/pi-types";
import type { CommandExecApi } from "@nseng-ai/foundation/command";

export type HerdrPiCommandApi = Omit<ExtensionAPI, "exec"> & CommandExecApi;
