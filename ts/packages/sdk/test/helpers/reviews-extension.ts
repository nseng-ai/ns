import { fileURLToPath } from "node:url";

import { installDescriptorExtension } from "./extension-descriptor-install.ts";

export const REVIEWS_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../incubator/reviews", import.meta.url),
);

export function installCheckedInReviewsExtension(projectRoot: string): void {
	installDescriptorExtension(projectRoot, REVIEWS_EXTENSION_SOURCE);
}
