export type NsCommandModuleLoader = () => unknown | Promise<unknown>;

export type NsCommandModuleReference =
	| { type: "file"; path: string }
	| { type: "package"; specifier: string }
	| { type: "loaded"; displayPath: string; load: NsCommandModuleLoader };

export interface NsCommandModuleReferenceHandlers<T> {
	file: (reference: Extract<NsCommandModuleReference, { type: "file" }>) => T;
	package: (reference: Extract<NsCommandModuleReference, { type: "package" }>) => T;
	loaded: (reference: Extract<NsCommandModuleReference, { type: "loaded" }>) => T;
}

export function matchNsCommandModuleReference<T>(
	reference: NsCommandModuleReference,
	handlers: NsCommandModuleReferenceHandlers<T>,
): T {
	switch (reference.type) {
		case "file":
			return handlers.file(reference);
		case "package":
			return handlers.package(reference);
		case "loaded":
			return handlers.loaded(reference);
	}
	return unsupportedModuleReference(reference);
}

export function fileModuleReference(path: string): NsCommandModuleReference {
	return { type: "file", path };
}

export function packageModuleReference(specifier: string): NsCommandModuleReference {
	return { type: "package", specifier };
}

export function loadedModuleReference(
	displayPath: string,
	load: NsCommandModuleLoader,
): NsCommandModuleReference {
	return { type: "loaded", displayPath, load };
}

export function moduleReferenceDisplay(reference: NsCommandModuleReference): string {
	return matchNsCommandModuleReference(reference, {
		file: (fileReference) => fileReference.path,
		package: (packageReference) => packageReference.specifier,
		loaded: (loadedReference) => loadedReference.displayPath,
	});
}

function unsupportedModuleReference(reference: never): never {
	throw new Error(`Unsupported ns command module reference: ${JSON.stringify(reference)}`);
}
