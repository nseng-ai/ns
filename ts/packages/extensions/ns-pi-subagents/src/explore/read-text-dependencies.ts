export type ReadTextFile = (path: string) => Promise<string>;

export interface ExploreReadTextFileDependencies {
	readTextFile?: ReadTextFile;
}
