import { dirname, resolve } from "node:path";

import type { FileSystemGateway } from "../context.ts";

export async function copyTree(
	fs: FileSystemGateway,
	source: string,
	destination: string,
): Promise<void> {
	if (!(await fs.isDirectory(source))) {
		await fs.mkdirp(dirname(destination));
		await fs.copyFile(source, destination);
		return;
	}
	await fs.mkdirp(destination);
	for (const entry of await fs.readDir(source)) {
		if (entry.isSymbolicLink)
			throw new Error(`Refusing to copy symbolic link: ${resolve(source, entry.name)}`);
		await copyTree(fs, resolve(source, entry.name), resolve(destination, entry.name));
	}
}
