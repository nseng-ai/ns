import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REVIEWS_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.ns/extensions/reviews", import.meta.url),
);

export function installCheckedInReviewsExtension(projectRoot: string): void {
	const destination = join(projectRoot, ".ns", "extensions", "reviews");
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(REVIEWS_EXTENSION_SOURCE, destination, { recursive: true });
}
