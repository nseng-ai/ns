export type ReadTextFile = (path: string) => Promise<string>;

export interface ReadTextFileDependencies {
	readTextFile?: ReadTextFile;
}
