import { objectiveTabModule } from "../objective-tab.ts";
import { stackMapTabModule } from "../stack-map-tab.ts";
import { createTabController, type TabController } from "./tab-controller.ts";

// Static registration seam. Future `sdl`-extension discovery replaces this array without changing
// the host loop or the modules themselves. Each module's concrete generics are erased at the
// createTabController boundary, so the host only ever sees the non-generic TabController contract.
export const tabControllers: readonly TabController[] = [
	createTabController(stackMapTabModule),
	createTabController(objectiveTabModule),
];
