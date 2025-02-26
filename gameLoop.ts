// File: gameLoop.ts
import {
	AnthropicOptions,
	GPTOptions,
	LanguageModel,
	LanguageModelName,
	models,
} from "./models.ts";
import { ChatMessage } from "./models.ts";
import { Game, GameStatus, MultiplayerGame } from "./types.ts";

/**
 * Sleep helper.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Logging helper using Deno's CSS styles.
 */
function logChatMessage(message: ChatMessage, model?: LanguageModel) {
	switch (message.role) {
		case "system":
			console.log(
				"%c[SYSTEM]: " + message.content,
				"color: orange;",
			);
			break;
		case "assistant":
			console.log(
				`%c[LLM ${model?.name}]: ${message.content}`,
				"color: red;",
			);
			break;
		case "user":
			console.log(
				"%c[USER]: " + message.content,
				"color: blue;",
			);
			break;
		default:
			console.log(
				`%c[${message.role.toUpperCase()}]: ` + message.content,
				"color: gray;",
			);
	}
}

/**
 * Helper function to obtain a parsed answer from an LLM.
 * It sends the answer parser prompt as a system message and the raw output as a user message.
 */
const getParsedResponse = async (
	answerParser: string,
	input: string,
	options?: Partial<GPTOptions | AnthropicOptions>,
): Promise<string> => {
	const response = await models[LanguageModelName["GPT-4o"]].complete(
		[
			{ role: "system", content: answerParser },
			{ role: "user", content: input },
		],
		{ top_p: 0.01, ...options },
	);
	return response.content.trim();
};

/**
 * Helper function to get the parsed answer using the answer parser prompt.
 * It accepts a game (which may have a dynamic answerParserPrompt), the current state, the raw answer,
 * and any additional GPT options.
 */
async function parseAnswer<GameState extends object>(
	game: {
		answerParserPrompt?: string | ((state: GameState) => string) | null;
	},
	state: GameState,
	rawAnswer: string,
	options?: Partial<GPTOptions | AnthropicOptions>,
): Promise<string> {
	let parserPrompt: string;
	if (game.answerParserPrompt) {
		if (typeof game.answerParserPrompt === "function") {
			parserPrompt = game.answerParserPrompt(state);
		} else {
			parserPrompt = game.answerParserPrompt;
		}
		return await getParsedResponse(parserPrompt, rawAnswer, options);
	}
	return rawAnswer;
}

/**
 * Extra options for running a game loop.
 */
export type GameLoopOptions = {
	useAnswerParser?: boolean;
	quiet?: boolean;
	delay?: number;
	gptOptions?: Partial<GPTOptions | AnthropicOptions>;
};

/**
 * Single-player game loop.
 */
export const gameLoop = async <
	GameState extends object,
	StateOptions extends unknown,
>(
	game: Game<GameState, StateOptions>,
	model: LanguageModel,
	stateOptions: StateOptions,
	options?: GameLoopOptions,
) => {
	const chat: ChatMessage[] = [];
	const verbose = !(options && options.quiet);
	let state = game.initializeState(stateOptions);

	// Log and send the initial prompt.
	const initialPrompt = typeof game.prompts.first === "string"
		? game.prompts.first
		: game.prompts.first(state);
	if (verbose) {
		logChatMessage({ role: "user", content: initialPrompt });
	}
	chat.push({ role: "user", content: initialPrompt });

	// Get and log the LLM's response.
	let response = await model.complete(chat, options?.gptOptions);
	if (verbose) {
		logChatMessage(response, model);
	}
	chat.push(response);

	const parsedFirst = game.answerParserPrompt
		? await parseAnswer(game, state, response.content, options?.gptOptions)
		: response.content;
	state = await game.updateState(state, parsedFirst);

	let status: GameStatus = await game.evaluateStatus(state);

	// Main game loop.
	while (status === GameStatus.Ongoing) {
		const turnPrompt = typeof game.prompts.turn === "string"
			? game.prompts.turn
			: game.prompts.turn(state);
		if (verbose) {
			logChatMessage({ role: "user", content: turnPrompt });
		}
		chat.push({ role: "user", content: turnPrompt });

		response = await model.complete(chat, options?.gptOptions);
		if (verbose) {
			logChatMessage(response, model);
		}
		chat.push(response);

		const parsedTurn = game.answerParserPrompt
			? await parseAnswer(
				game,
				state,
				response.content,
				options?.gptOptions,
			)
			: response.content;
		state = await game.updateState(state, parsedTurn);
		status = await game.evaluateStatus(state);

		if (options?.delay) {
			await sleep(options.delay);
		}
	}

	console.log(
		"%c" + status.toString() + "!",
		"color: purple; font-weight: bold;",
	);

	await Deno.writeTextFile("out/chat.json", JSON.stringify(chat, null, "\t"));

	return { state, status };
};

/**
 * Multiplayer game loop.
 */
/**
 * Additional options for multiplayer game loops
 */
export type MultiplayerGameLoopOptions = {
	modelOptions?: Partial<GPTOptions | AnthropicOptions>[];
};

export const multiplayerGameLoop = async <
	GameState extends object,
	StateOptions,
>(
	game: MultiplayerGame<GameState, StateOptions>,
	models: LanguageModel[],
	stateOptions: StateOptions,
	options?: MultiplayerGameLoopOptions,
) => {
	const chats: ChatMessage[][] = models.map(() => []);
	let status = GameStatus.Ongoing;
	let state = game.initializeState(stateOptions);

	// Loop until the game status is not ongoing.
	while (status === GameStatus.Ongoing) {
		for (
			let player = 0;
			player <
				(game.players === "dynamic" ? models.length : game.players);
			player++
		) {
			const model = models[player];

			// If the game wants to skip this player (e.g. if they folded), log it.
			if (game.shouldSkip && game.shouldSkip(state, player)) {
				console.log(
					`%cSkipped player ${player + 1}`,
					"color: gray; font-style: italic;",
				);
				continue;
			}

			// Use the appropriate prompt.
			if (chats[player].length === 0) {
				const firstPrompt = typeof game.prompts.first === "string"
					? game.prompts.first
					: game.prompts.first(state, player);
				console.log(
					`%c[PLAYER ${player + 1} PROMPT]: ${firstPrompt}`,
					"color: blue;",
				);
				chats[player].push({ role: "user", content: firstPrompt });
			} else {
				const turnPrompt = typeof game.prompts.turn === "string"
					? game.prompts.turn
					: game.prompts.turn(state, player);
				console.log(
					`%c[PLAYER ${player + 1} PROMPT]: ${turnPrompt}`,
					"color: blue;",
				);
				chats[player].push({ role: "user", content: turnPrompt });
			}

			// Get the model's response and log it.
			// Determine which options to use for this player
			const playerOptions = options && options?.modelOptions?.[player] 

			const response = await model.complete(chats[player], playerOptions);
			logChatMessage(response, model);
			chats[player].push(response);

			const parsedAnswer = game.answerParserPrompt
				? await parseAnswer(game, state, response.content, playerOptions)
				: response.content;
			state = await game.updateState(state, parsedAnswer, player);
			status = await game.evaluateStatus(state);

			if (status !== GameStatus.Ongoing) {
				break;
			}
		}
		await Deno.writeTextFile(
			"out/chats.json",
			JSON.stringify(chats, null, "\t"),
		);
	}

	let winner = -1;
	if (status !== GameStatus.Draw) {
		winner = game.winner(state);
	}

	console.log(
		"%c" + status.toString() + "!",
		"color: purple; font-weight: bold;",
	);

	console.log(state);
	return { state, status, winner };
};

/**
 * Composite adversarial game loop for games sharing the same state type.
 *
 * This loop operates in two phases on a common state T:
 *
 * 1. **Generator Phase:**
 *    The generator game is run (using its prompts, updateState, and evaluateStatus methods)
 *    until it wins—i.e. until it produces a valid challenge.
 *
 * 2. **Solver Phase:**
 *    Using the same state T (which now contains the challenge), the solver game is run until
 *    it wins (for example, when the solver produces the correct answer).
 *
 * Both generatorGame and solverGame must share the same state type T.
 */
export async function adversarialGameLoop<
	GameState extends object,
	GeneratorOptions,
	SolverOptions,
>(
	generatorGame: Game<GameState, GeneratorOptions>,
	solverGame: Game<GameState, SolverOptions>,
	generatorModel: LanguageModel,
	solverModel: LanguageModel,
	generatorParams: GeneratorOptions,
	options?: { quiet?: boolean; delay?: number; gptOptions?: GPTOptions },
) {
	// --- Phase 1: Generator Phase ---
	const genChat: ChatMessage[] = [];
	const genVerbose = !(options && options.quiet);
	let state = generatorGame.initializeState(generatorParams);

	// Send the initial prompt from the generator game.
	const genInitialPrompt = typeof generatorGame.prompts.first === "string"
		? generatorGame.prompts.first
		: generatorGame.prompts.first(state);
	if (genVerbose) {
		logChatMessage({ role: "user", content: genInitialPrompt });
	}
	genChat.push({ role: "user", content: genInitialPrompt });

	// Run the generator loop until a valid challenge is produced.
	let generatorResponse = await generatorModel.complete(
		genChat,
		options?.gptOptions,
	);
	if (genVerbose) {
		logChatMessage(generatorResponse, generatorModel);
	}
	genChat.push(generatorResponse);
	state = await generatorGame.updateState(state, generatorResponse.content);
	let generatorStatus = await generatorGame.evaluateStatus(state);

	let solChat: ChatMessage[] = [];

	while (generatorStatus === GameStatus.Ongoing) {
		//1. Generator
		const genTurnPrompt = typeof generatorGame.prompts.turn === "string"
			? generatorGame.prompts.turn
			: generatorGame.prompts.turn(state);
		genChat.push({
			content: genTurnPrompt,
			role: "user",
		});

		generatorResponse = await generatorModel.complete(
			genChat,
			options?.gptOptions,
		);
		genChat.push(generatorResponse);
		console.log("generator_chat", generatorResponse.content);

		state = await generatorGame.updateState(
			state,
			generatorResponse.content,
		);

		//2. Solver
		const solTurnPrompt = typeof solverGame.prompts.turn === "string"
			? solverGame.prompts.turn
			: solverGame.prompts.turn(state);

		//We re-initialize solver chat every time
		//TODO make option
		solChat = [{
			content: solTurnPrompt,
			role: "user",
		}];

		console.log(solChat);
		const solverResponse = await solverModel.complete(
			solChat,
			options?.gptOptions,
		);
		solChat.push(solverResponse);
		console.log("solver_chat", solverResponse.content);

		state = await solverGame.updateState(state, solverResponse.content);

		//3. Check correct
		generatorStatus = await solverGame.evaluateStatus(state);
	}

	// Optionally write logs for both phases.
	await Deno.writeTextFile(
		"out/composite_generator_chat.json",
		JSON.stringify(genChat, null, "\t"),
	);
	await Deno.writeTextFile(
		"out/composite_solver_chat.json",
		JSON.stringify(solChat, null, "\t"),
	);

	return state;
}
