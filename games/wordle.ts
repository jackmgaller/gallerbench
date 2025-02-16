import { Game, GameStatus } from "../types.ts";

type WordleState = {
	guesses: string[];
	solution: string;
};

export const initializeWordleState = (
	solution: string,
): WordleState => {
	return {
		guesses: [],
		solution,
	};
};

const scoreGuess = (guess: string, target: string): string => {
	guess = guess.toLowerCase();
	target = target.toLowerCase();

	if (guess.length !== 5) {
		throw new Error(`Wordle guess ${guess} is of length ${guess.length}!`);
	}

	const response: (string | null)[] = Array(5).fill("Grey");
	const targetArr: (string | null)[] = target.split("");
	const guessArr: (string | null)[] = guess.split("");

	// First pass for greens
	for (let i = 0; i < 5; i++) {
		if (guessArr[i] === targetArr[i]) {
			response[i] = "Green";
			targetArr[i] = null;
			guessArr[i] = null;
		}
	}

	// Second pass for yellows
	for (let i = 0; i < 5; i++) {
		if (guessArr[i] && targetArr.includes(guessArr[i])) {
			response[i] = "Yellow";
			targetArr[targetArr.indexOf(guessArr[i])] = null;
		}
	}

	return response.join(" ");
};

const turnPrompt = (state: { guesses: string[]; solution: string }): string => {
	const { guesses, solution } = state;
	const lastGuess = guesses[guesses.length - 1];

	const scoredWordle = scoreGuess(lastGuess, solution);

	let prompt = `For guess "${
		lastGuess.toUpperCase().split("").join(" ")
	}" you got ${scoredWordle}.\n`;

	prompt += "In other words, that's:\n";

	for (let i = 0; i < 5; i++) {
		const letter = lastGuess.toUpperCase().split("")[i];
		const color = scoredWordle.split(" ")[i];

		prompt += `${letter}: ${color}\n`;
	}

	prompt += "\n";
	prompt += "What is your next guess?";

	return prompt;
};

// Define games with their specific update logic
export const wordleGame: Game<WordleState, string> = {
	name: "Wordle",
	version: 1.5,
	prompts: {
		first:
			`You are playing Wordle. You will guess the word. For each try, you propose a five letter English word to guess the target. Only common English words are allowed. You cannot propose words that do not exist. You cannot propose proper names. You cannot propose acronyms. You only have six tries, so you must use your suggestions wisely to discern as many clues as possible.\n\nWhat is your first guess?`,
		turn: turnPrompt,
	},
	evaluateStatus: ({ guesses, solution }) => {
		let score = "";

		try {
			score = scoreGuess(guesses[guesses.length - 1], solution);
		} catch (e) {
			console.error("Loss on account of error!");
			console.error(e);
			return GameStatus.Loss;
		}

		if (score === "Green Green Green Green Green") {
			return GameStatus.Win;
		} else if (guesses.length >= 6) {
			return GameStatus.Loss;
		} else {
			return GameStatus.Ongoing;
		}
	},
	answerParserPrompt:
		"I am an AI researcher investigating chatbots playing the game Wordle. Your job is to take their guess, and parse out specifically what their guess was. I need you take the correct word they guessed, and return only that - no other words. Do not return the wrong word.",
	initializeState: initializeWordleState,
	updateState: (state, parsedAnswer) => {
		state.guesses.push(parsedAnswer);
		return state;
	},
};
