export interface PublicPackageEntry {
	readonly path: string;
	readonly root: string;
	readonly manifest: { readonly name: string; readonly version?: string };
}

export interface PublicPackageContext {
	readonly manifestByName: ReadonlyMap<string, PublicPackageEntry>;
}

export const repoRoot: string;
export const workspaceRoot: string;
export const intendedPublicPackages: readonly string[];
export const publicPublishOrder: readonly string[];
export function loadPublicPackageContext(): Promise<PublicPackageContext>;
export function publishRootForEntry(entry: PublicPackageEntry): string;
