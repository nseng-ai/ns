export function workflowManifestId(path: string, exportName: string): string {
	return `workflow//./${path.replace(/\.ts$/u, "")}//${exportName}`;
}
