export function formatPickupHandoffCommand(branch: string, slug: string): string {
	return `/sdl:handoff:pickup --branch ${branch} ${slug}`;
}
