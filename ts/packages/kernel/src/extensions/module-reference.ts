export type NsCommandModuleLoader = () => unknown | Promise<unknown>;

export type NsCommandModuleReference =
	| { type: "file"; path: string }
	| { type: "package"; specifier: string }
	| { type: "loaded"; displayPath: string; load: NsCommandModuleLoader };

export function moduleReferenceDisplay(reference: NsCommandModuleReference): string {
	if (reference.type === "file") return reference.path;
	if (reference.type === "package") return reference.specifier;
	return reference.displayPath;
}
