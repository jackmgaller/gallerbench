// Define the shared interfaces and types
export enum GameStatus {
	Win = "Win",
	Loss = "Loss",
	Draw = "Draw",
	Ongoing = "Ongoing",
}

export type Game<GameState extends object = Record<string, unknown>> = {
	name: string;
	prompts: {
		first: string | ((state: GameState) => string);
		turn: string | ((state: GameState) => string);
	};
	evaluateStatus: (state: GameState) => GameStatus | Promise<GameStatus>;
	answerParserPrompt: string;
	version: number;
	initializeState: (...args: any[]) => GameState;
	updateState: (
		state: GameState,
		parsedAnswer: string,
		currentPlayer?: number,
	) => GameState;
};

export type MultiplayerGame<GameState extends object> =
	& Omit<Game<GameState>, "prompts">
	& {
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
