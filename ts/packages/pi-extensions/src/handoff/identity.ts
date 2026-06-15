export function formatPickupHandoffCommand(branch: string, slug: string): string {
	return `/handoff:pickup --branch ${branch} ${slug}`;
}
