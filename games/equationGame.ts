import { Game, GameStatus } from "../types.ts";

export interface EquationState {
	equation: string | null;
	solved: boolean;
}

export const equationGeneratorGame: Game<EquationState, null> = {
	name: "EquationGeneratorGame",
	version: 1.0,
	prompts: {
		first: "Your task: Create a math problem that evaluates exactly to 19. Do not mention the answer.",
		turn:
			"The solver solved that problem! Try and generate an even harder math problem which equals 19. You can do calc, trig, linear algebra, discrete math, geometry, or anything you can think of. The important thing is the problems get more and more difficult. Again, be sure not to mention the answer.",
	},
	answerParserPrompt:
		"You are an LLM tasked with only returning the math problem the user gives. Do not include the answer or other fluff text.",
	initializeState: () => {
		return { equation: null, solved: false };
	},
	updateState: (state: EquationState, parsedAnswer: string) => {
		// Record the generated equation.
		state.equation = parsedAnswer.trim();
		return state;
	},
	evaluateStatus: (): GameStatus => {
		return GameStatus.Ongoing;
	},
};

const equationSolverPrompt = (state: EquationState) =>
	`Solve the following math problem and provide only the result:\n\n${state.equation}`;

export const equationSolverGame: Game<EquationState, string> = {
	name: "EquationSolverGame",
	version: 1.0,
	prompts: {
		first: equationSolverPrompt,
		turn: equationSolverPrompt,
	},
	answerParserPrompt: "You are an LLM tasked with only returning the answer the user provided",
	// The initial state is created using the challenge from the generator.
	initializeState: (equation: string): EquationState => {
		return { equation, solved: false };
	},
	updateState: (state: EquationState, parsedAnswer: string) => {
		// Mark the game as solved only if the answer is exactly "19".
		console.log("parsedAnswer", parsedAnswer);
		if (parsedAnswer.trim() === "19") {
			state.solved = true;
		}
		return state;
	},
	evaluateStatus: (state: EquationState): GameStatus => {
		return state.solved ? GameStatus.Ongoing : GameStatus.Loss;
	},
};
