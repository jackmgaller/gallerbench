// GameEngine.ts
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
 * Sleep helper
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Logging helper using Deno's CSS styles
 */
function logChatMessage(message: ChatMessage, modelName?: string) {
	switch (message.role) {
		case "system":
			console.log(
				"%c[SYSTEM]: " + message.content,
				"color: orange;",
			);
			break;
		case "assistant":
			console.log(
				`%c[LLM ${
					modelName ? "(" + modelName + ")" : ""
				}]: ${message.content}`,
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
): Promise<string> => {
	const response = await models[LanguageModelName["GPT-4o"]].complete(
		[
			{ role: "system", content: answerParser },
			{ role: "user", content: input },
		],
		{ top_p: 0.01 },
	);
	return response.content.trim();
};

/**
 * Extra options for running a game loop.
 */
export type GameLoopOptions = {
	quiet?: boolean;
	delay?: number;
	gptOptions?: Partial<GPTOptions | AnthropicOptions>;
};

/**
 * Single-player game loop.
 */
export const gameLoop = async <GameState extends object>(
	game: Game<GameState>,
	model: LanguageModel,
	state: GameState,
	options?: GameLoopOptions,
) => {
	const chat: ChatMessage[] = [];
	const verbose = !(options && options.quiet);

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
		logChatMessage(response, model.name);
	}
	chat.push(response);

	let parsedAnswer = await getParsedResponse(
		game.answerParserPrompt,
		response.content,
	);
	state = game.updateState(state, parsedAnswer);
	let status = game.evaluateStatus(state);

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
			logChatMessage(response, model.name);
		}
		chat.push(response);

		parsedAnswer = await getParsedResponse(
			game.answerParserPrompt,
			response.content,
		);
		state = game.updateState(state, parsedAnswer);
		status = game.evaluateStatus(state);

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
export const multiplayerGameLoop = async <GameState extends object>(
	game: MultiplayerGame<GameState>,
	models: LanguageModel[],
	state: GameState,
	gptOptions?: Partial<GPTOptions | AnthropicOptions>,
) => {
	const chats: ChatMessage[][] = models.map(() => []);
	let status = GameStatus.Ongoing;

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
			const response = await model.complete(chats[player], gptOptions);
			logChatMessage(response, model.name);
			chats[player].push(response);

			const parsedAnswer = await getParsedResponse(
				game.answerParserPrompt,
				response.content,
			);
			state = game.updateState(state, parsedAnswer, player);
			status = game.evaluateStatus(state);

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
