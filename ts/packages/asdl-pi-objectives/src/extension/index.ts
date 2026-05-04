import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerObjectiveList } from "../commands/list.ts";
import { registerObjectiveNext } from "../commands/next.ts";
import { registerObjectiveRoot } from "../commands/objective.ts";

export default function objectivesExtension(pi: ExtensionAPI): void {
	registerObjectiveList(pi);
	registerObjectiveNext(pi);
	registerObjectiveRoot(pi);
}
