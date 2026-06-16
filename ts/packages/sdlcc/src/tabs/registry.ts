import { objectiveTabModule } from "../objective-tab.ts";
import { stackMapTabModule } from "../stack-map-tab.ts";
import type { TabModule } from "./tab-module.ts";

// Static registration seam. Future `sdl`-extension discovery replaces this array without changing
// the host loop or the modules themselves. Method-syntax bivariance lets concrete modules widen to
// the erased element type, which is sound here because the host only feeds each module values it
// produced itself (model, state).
export const tabModules: readonly TabModule<unknown, unknown, unknown, unknown>[] = [
	stackMapTabModule,
	objectiveTabModule,
];
