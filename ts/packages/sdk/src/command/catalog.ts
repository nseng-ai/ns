export interface CatalogView {
	has(packageName: string): boolean;
}

export interface NsContext {
	readonly catalog: CatalogView;
}

export function createCatalogView(packageNames: ReadonlySet<string>): CatalogView {
	return {
		has: (packageName) => packageNames.has(packageName),
	};
}
