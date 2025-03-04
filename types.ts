export enum GameStatus {
	Win = "Win",
	Loss = "Loss",
	Draw = "Draw",
	Ongoing = "Ongoing",
}

export type Game<
	GameState extends object = Record<string, unknown>,
	StateOptions = unknown,
> = {
	name: string;
	prompts: {
		first: string | ((state: GameState) => string);
		turn: string | ((state: GameState) => string);
	};
	evaluateStatus: (state: GameState) => GameStatus | Promise<GameStatus>;
	answerParserPrompt?: string | ((state: GameState) => string) | null;
	version: number;
	initializeState: (options: StateOptions) => GameState | Promise<GameState>;
	updateState: (
		state: GameState,
		parsedAnswer: string,
		currentPlayer?: number,
	) => GameState;
};

export type MultiplayerGame<
	GameState extends object,
	StateOptions = unknown,
> = Omit<Game<GameState, StateOptions>, "prompts"> & {
	players: number | "dynamic";
	prompts: {
		first:
			| string
			| ((state: GameState, currentPlayer: number) => string);
		turn:
			| string
			| ((state: GameState, currentPlayer: number) => string);
	};
	shouldSkip?: (state: GameState, currentPlayer: number) => boolean;
	winner: (state: GameState) => number;
};
