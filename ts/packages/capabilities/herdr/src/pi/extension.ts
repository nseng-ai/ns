import type { ExtensionAPI } from "@nseng-ai/capability-kit/cmux/types";

import {
	createHerdrSidebarControllerWithPiWiring,
	registerHerdrSidebarCommands,
} from "./sidebar.ts";

export default function registerHerdrPiExtension(pi: ExtensionAPI): void {
	const sidebarController = createHerdrSidebarControllerWithPiWiring(pi);
	registerHerdrSidebarCommands(pi, sidebarController);
}

export { registerHerdrPiExtension };
