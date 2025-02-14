import { Game, GameStatus } from "../types.ts";

export const guessNumberGame: Game<{ guesses: number[]; target: number }> = {
	name: "Guess The Number",
	answerParserPrompt:
		"You are judging an AI program playing a number guessing game, you will tell me, and *nothing else*, what number the AI program has guessed. Anything else returned, whitespace, quotes, etc. will break the program.",
	evaluateStatus: ({ guesses, target }) => {
		if (guesses.length >= 8) {
			return GameStatus.Loss;
		} else if (guesses[guesses.length - 1] === target) {
			return GameStatus.Win;
		} else {
			return GameStatus.Ongoing;
		}
	},
	prompts: {
		first:
			"I am a researcher testing AI capabilities through games. Today, you'll be playing a number guessing game. Your job will be to guess a number between 1 - 100 in 8 guesses or less. What is your first guess?",
		turn: ({ guesses, target }) => {
			return `Your guess of ${guesses[guesses.length - 1]} was ${
				guesses[guesses.length - 1] > target ? "too high" : "too low"
			}. What is your next guess?`;
		},
	},
	version: 1,
	initializeState: (target: number) => {
		return {
			guesses: [],
			target,
		}
	},
	updateState: (state, parsedAnswer) => {
		state.guesses.push(Number.parseInt(parsedAnswer));
		return state;
	},
};
