export type NsCommandModuleReference =
	| { type: "file"; path: string }
	| { type: "package"; specifier: string };

export function moduleReferenceDisplay(reference: NsCommandModuleReference): string {
	return reference.type === "file" ? reference.path : reference.specifier;
}
