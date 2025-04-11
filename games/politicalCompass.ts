// politicalCompass.ts
import { Game, GameStatus } from "../types.ts";
import { LanguageModel } from "../models.ts";
import { gameLoop } from "../gameLoop.ts";
import { crypto } from "https://deno.land/std@0.220.1/crypto/mod.ts";

// Define the type for a political question
interface PoliticalQuestion {
	question: string;
}

// Define the type for political response data
interface PoliticalResponse {
	question: string;
	answer: string;
}

// Define the game state
interface PoliticalCompassState {
	questions: PoliticalQuestion[];
	correctAnswers: PoliticalResponse[];
	responses: string[];
	currentQuestionIndex: number;
	userBeliefs: string;
	score: number;
	cachedResults?: boolean;
}

// Define input parameters for game initialization
interface PoliticalCompassParams {
	questionsPath: string;
	answersPath: string;
	userBeliefs: string;
	skipCache?: boolean;
}

// Define cache result type
interface CachedPoliticalCompassResult {
	model: string;
	responses: string[];
	score: number;
}

/**
 * Generates a cache key based on model name and user beliefs to uniquely identify a cache entry
 * @param modelName The name of the language model
 * @param userBeliefs The text of user's political beliefs
 * @returns A hash string for cache lookup
 */
function generateCacheKey(modelName: string, userBeliefs: string): string {
	const encoder = new TextEncoder();
	const data = encoder.encode(`${modelName}:${userBeliefs}`);
	const hashBuffer = crypto.subtle.digestSync("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	return hashHex.substring(0, 8);
}

/**
 * Cache management for political compass results
 */
const PoliticalCompassCache = {
	cachePath: "cache/politicalCompass.json",

	/**
	 * Load all cached results
	 * @returns Record of cached results by key
	 */
	loadCache(): Record<string, CachedPoliticalCompassResult> {
		try {
			try {
				Deno.statSync(this.cachePath);
			} catch {
				// Cache file doesn't exist yet
				return {};
			}

			const cacheContent = Deno.readTextFileSync(this.cachePath);
			return JSON.parse(cacheContent);
		} catch (error) {
			console.error("Error loading cache:", error);
			return {};
		}
	},

	/**
	 * Save the entire cache
	 * @param cache The cache object to save
	 */
	saveCache(cache: Record<string, CachedPoliticalCompassResult>): void {
		try {
			// Ensure cache directory exists
			try {
				Deno.mkdirSync("cache", { recursive: true });
			} catch {
				// Directory exists, that's fine
			}

			Deno.writeTextFileSync(this.cachePath, JSON.stringify(cache, null, 2));
		} catch (error) {
			console.error("Error saving cache:", error);
		}
	},

	/**
	 * Get a cached result if it exists
	 * @param modelName The model name
	 * @param userBeliefs The user beliefs text
	 * @returns The cached result or null if not found
	 */
	get(modelName: string, userBeliefs: string): CachedPoliticalCompassResult | null {
		const cache = this.loadCache();
		const key = generateCacheKey(modelName, userBeliefs);
		return cache[key] || null;
	},

	/**
	 * Store a result in the cache
	 * @param modelName The model name
	 * @param userBeliefs The user beliefs text
	 * @param result The result to cache
	 */
	set(modelName: string, userBeliefs: string, result: CachedPoliticalCompassResult): void {
		const cache = this.loadCache();
		const key = generateCacheKey(modelName, userBeliefs);
		cache[key] = result;
		this.saveCache(cache);
	},
};

/**
 * A game that tests how well an LLM can infer a person's political compass answers
 * based on their recorded statements about political beliefs.
 */
export const politicalCompassGame: Game<PoliticalCompassState, PoliticalCompassParams> = {
	name: "Political Compass Mirroring",
	version: 1,

	prompts: {
		first: (state: PoliticalCompassState) => {
			return `I am going to test your ability to infer a person's political beliefs based on their statements.

I have a recording of a person discussing their political beliefs. Here is a transcript of what they said:

${state.userBeliefs}

I want you to predict how this person would answer political compass questions.

For each question, you must answer with one of these options:
- Strongly Disagree
- Disagree
- Agree
- Strongly Agree

Here is your first question:
${state.questions[state.currentQuestionIndex].question}

What would this person's answer be? Answer with just one of the four options.`;
		},

		turn: (state: PoliticalCompassState) => {
			return `Here is the next question:
${state.questions[state.currentQuestionIndex].question}

What would this person's answer be? Answer with just one of these options:
- Strongly Disagree
- Disagree
- Agree
- Strongly Agree`;
		},
	},

	answerParserPrompt: () => {
		return `Extract the answer from the text. The response must be one of: "Strongly Disagree", "Disagree", "Agree", or "Strongly Agree".

If the response doesn't contain one of these exact answers, select the one that most closely matches the tone and content of the response.`;
	},

	initializeState: (params: PoliticalCompassParams): PoliticalCompassState => {
		const questionsJson = Deno.readTextFileSync(params.questionsPath);
		const answersJson = Deno.readTextFileSync(params.answersPath);

		const questions = JSON.parse(questionsJson).questions;
		const correctAnswers = JSON.parse(answersJson).responses;

		return {
			questions,
			correctAnswers,
			responses: [],
			currentQuestionIndex: 0,
			userBeliefs: params.userBeliefs,
			score: 0,
		};
	},

	updateState: (state: PoliticalCompassState, parsedAnswer: string): PoliticalCompassState => {
		state.responses.push(parsedAnswer);

		const correctAnswer = state.correctAnswers[state.currentQuestionIndex].answer;

		// Map answers to numerical values
		const answerValues: Record<string, number> = {
			"strongly disagree": -1,
			"disagree": -0.5,
			"agree": 0.5,
			"strongly agree": 1,
		};

		// Calculate difference between model answer and correct answer
		const modelValue = answerValues[parsedAnswer.toLowerCase()];
		const correctValue = answerValues[correctAnswer.toLowerCase()];

		if (modelValue !== undefined && correctValue !== undefined) {
			// Perfect match
			if (modelValue === correctValue) {
				state.score += 1;
			} // Partial match (only off by one level)
			else if (Math.abs(modelValue - correctValue) === 0.5) {
				state.score += 0.5;
			} // Close but not perfect (agree vs strongly disagree or vice versa)
			else if (Math.abs(modelValue - correctValue) === 1.5) {
				state.score += 0.25;
			}
			// Complete opposite (no points)
		}

		state.currentQuestionIndex += 1;

		return state;
	},

	evaluateStatus: (state: PoliticalCompassState): GameStatus => {
		if (state.currentQuestionIndex >= state.questions.length) {
			return GameStatus.Win;
		}
		return GameStatus.Ongoing;
	},
};

// Function to run the survey to collect a user's political compass answers
export async function runSurvey() {
	// Read the questions and answer choices from the JSON file.
	const jsonText = await Deno.readTextFile("data/Political Compass/questions.json");
	const data = JSON.parse(jsonText);
	const questions = data.questions;
	const answerOptions = data.answers;

	// Ask for the user's name.
	const name = prompt("Enter your name:");
	if (!name) {
		console.error("Name is required!");
		Deno.exit(1);
	}

	// Initialize an array to hold the responses.
	const responses: { question: string; answer: string }[] = [];

	// Loop over each question.
	for (const { question } of questions) {
		let valid = false;
		let selectedAnswer: string | null = null;

		// Continue to prompt until a valid choice is made.
		while (!valid) {
			const input = prompt(
				`${question}\n1: ${answerOptions[0]}\n2: ${answerOptions[1]}\n3: ${answerOptions[2]}\n4: ${
					answerOptions[3]
				}\nEnter a number (1-4):`,
			);
			if (input && ["1", "2", "3", "4"].includes(input.trim())) {
				const answerIndex = parseInt(input.trim(), 10) - 1;
				selectedAnswer = answerOptions[answerIndex];
				valid = true;
			} else {
				console.log("Invalid input. Please enter a number between 1 and 4.");
			}
		}

		responses.push({
			question,
			answer: selectedAnswer!,
		});
	}

	// Prepare the output object.
	const output = {
		name,
		responses,
	};

	// Ensure the output directory exists.
	await Deno.mkdir("data/Political Compass", { recursive: true });

	// Write the output to a file named after the user.
	const outputPath = `data/Political Compass/${name}.json`;
	await Deno.writeTextFile(outputPath, JSON.stringify(output, null, 2));

	console.log(`Your responses have been saved to ${outputPath}`);
}

// Function to benchmark political compass models
export async function benchmarkPoliticalCompass(
	modelsToTest: LanguageModel[],
	userBeliefsPath: string,
	userResponsesPath: string,
	skipCache = false,
) {
	// Read the user's political beliefs from the file
	const userBeliefs = await Deno.readTextFile(userBeliefsPath);

	// Define game parameters
	const gameParams = {
		questionsPath: "data/Political Compass/questions.json",
		answersPath: userResponsesPath,
		userBeliefs: userBeliefs,
		skipCache,
	};

	// Initialize results array
	const results = [];

	// Load correct answers for score calculation
	const answersJson = await Deno.readTextFile(userResponsesPath);
	const correctAnswers = JSON.parse(answersJson).responses;

	// Map answers to numerical values for scoring
	const answerValues: Record<string, number> = {
		"strongly disagree": -1,
		"disagree": -0.5,
		"agree": 0.5,
		"strongly agree": 1,
	};

	// Test each model
	for (const model of modelsToTest) {
		console.log(`Testing model: ${model.name}`);

		let responses: string[] = [];
		let totalPoints = 0;
		let fromCache = false;

		// Check if we have cached results for this model and user beliefs
		if (!skipCache) {
			const cachedResult = PoliticalCompassCache.get(model.name, userBeliefs);
			if (cachedResult) {
				console.log(`Using cached results for ${model.name}`);
				responses = cachedResult.responses;
				totalPoints = cachedResult.score;
				fromCache = true;
			}
		}

		// If no cached results, run the game
		if (!fromCache) {
			// Run the game with this model
			const gameResult = await gameLoop(
				politicalCompassGame,
				model,
				gameParams,
				{
					delay: 500,
				},
			);

			// Get responses from game result
			responses = gameResult.state.responses;

			// Calculate score
			totalPoints = 0;
			const maxPossiblePoints = responses.length;

			// Compare model responses with correct answers
			for (let i = 0; i < responses.length; i++) {
				const modelValue = answerValues[responses[i].toLowerCase()];
				const correctValue = answerValues[correctAnswers[i].answer.toLowerCase()];

				if (modelValue !== undefined && correctValue !== undefined) {
					// Perfect match
					if (modelValue === correctValue) {
						console.log("Perfect match");
						totalPoints += 1;
					} // Partial match (only off by one level)
					else if (Math.abs(modelValue - correctValue) === 0.5) {
						console.log("Partial match");
						totalPoints += 0.5;
					} // Close but not perfect (agree vs strongly disagree or vice versa)
					else if (Math.abs(modelValue - correctValue) === 1.5) {
						console.log("Not perfect");
						totalPoints += 0.25;
					} else {
						console.log("Complete miss");
					}
					// Complete opposite (no points)
				}
			}

			// Cache the results for future use
			PoliticalCompassCache.set(model.name, userBeliefs, {
				model: model.name,
				responses,
				score: totalPoints,
			});
		}

		const maxPossiblePoints = responses.length;
		const accuracy = (totalPoints / maxPossiblePoints) * 100;

		// Add result to results array
		results.push({
			model: model.name,
			score: totalPoints,
			totalQuestions: responses.length,
			accuracy: accuracy,
			fromCache,
			responses: responses.map((response, index) => ({
				question: correctAnswers[index].question,
				modelAnswer: response,
				correctAnswer: correctAnswers[index].answer,
				isCorrect: response.toLowerCase() === correctAnswers[index].answer.toLowerCase(),
				agreement: (() => {
					const mValue = answerValues[response.toLowerCase()];
					const cValue = answerValues[correctAnswers[index].answer.toLowerCase()];
					if (mValue === cValue) return "exact";
					if (Math.abs(mValue - cValue) === 0.5) return "close";
					if (Math.abs(mValue - cValue) === 1.5) return "somewhat opposite";
					return "opposite";
				})(),
			})),
		});

		console.log(`Model: ${model.name}`);
		console.log(`Score: ${totalPoints}/${responses.length}`);
		console.log(`Accuracy: ${accuracy.toFixed(2)}%`);
		console.log(`From cache: ${fromCache}`);
		console.log("-----------------------------------");
	}

	// Sort models by accuracy
	results.sort((a, b) => b.accuracy - a.accuracy);

	// Write results to file
	const outputPath = `out/political_compass_results.json`;
	await Deno.writeTextFile(outputPath, JSON.stringify(results, null, 2));

	console.log(`Results have been saved to ${outputPath}`);

	return results;
}
