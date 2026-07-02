export interface FailureCatalogEntry<Arm extends string, Verdict, Failure, Context> {
	arm: Arm;
	verdict: Verdict;
	message: (failure: Failure, context: Context) => string;
}

export type FailureCatalog<Failure extends { kind: string }, Verdict, Context> = {
	[K in Failure["kind"]]: FailureCatalogEntry<K, Verdict, Failure, Context>;
};

export function defineFailureCatalog<Failure extends { kind: string }, Verdict, Context>() {
	return (
		catalog: FailureCatalog<Failure, Verdict, Context>,
	): FailureCatalog<Failure, Verdict, Context> => catalog;
}
