import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";
import type { CommandExecApi } from "@nseng-ai/foundation/command";

export type HerdrPiCommandApi = Omit<ExtensionAPI, "exec"> & CommandExecApi;
