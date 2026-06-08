import { finalizeBranchSlug } from "@asdl/pi-extension-runtime/branch-slug";

export { finalizeBranchSlug, MAX_BRANCH_SLUG_LENGTH, sanitizeBranchName, trimBranchSlugToLength } from "@asdl/pi-extension-runtime/branch-slug";

export function normalizeBranchSlugText(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}
