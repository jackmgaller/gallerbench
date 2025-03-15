// models.ts
import "jsr:@std/dotenv/load";
import { ModelError } from "./utils/errors.ts";

/**
 * The API key for accessing OpenAI's endpoints.
 */
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

/**
 * The API key for accessing Anthropic's endpoints.
 */
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

/**
 * A chat message object exchanged with language models.
 *
 * @property role - The role of the message sender (e.g., "system", "user", "assistant").
 * @property content - The content of the message.
 */
export type ChatMessage = {
	role: string;
	content: string;
};

/**
 * A chunk of a chat message received during streaming.
 *
 * @property role - The role of the message sender (if available in the chunk).
 * @property content - The content fragment of the message.
 * @property delta - For OpenAI compatibility, contains the incremental content.
 */
export type ChatMessageChunk = {
	role?: string;
	content?: string;
	delta?: {
		content?: string;
	};
};

/**
 * Options specific to GPT-based models.
 *
 * @property temperature - Sampling temperature.
 * @property n - Number of completions to generate.
 * @property top_p - Nucleus sampling probability threshold.
 */
export type GPTOptions = {
	temperature?: number;
	n?: number;
	top_p?: number;
};

/**
 * Options to reasoning specific GPT models.
 *
 * @property reasoning_effort - Indicates the level of reasoning effort ("low", "medium", or "high").
 */
export type GPTReasoningOptions = GPTOptions & {
	reasoning_effort?: "low" | "medium" | "high";
};

/**
 * Options specific to Anthropic models.
 *
 * @property temperature - Sampling temperature.
 * @property top_k - The top-k tokens to consider.
 * @property top_p - Nucleus sampling probability threshold.
 * @property system - System prompt or instructions.
 * @property max_tokens - Maximum number of tokens to generate.
 */
export type AnthropicOptions = {
	temperature?: number;
	thinking?: {
		type: "enabled",
        budget_tokens: number
	}
	top_k?: number;
	top_p?: number;
	system?: string;
	max_tokens?: number;
};

/**
 * Abstract base class for all language models.
 *
 * @abstract
 */
export abstract class LanguageModel {
	/**
	 * Creates an instance of LanguageModel.
	 *
	 * @param name - The unique name or identifier for the language model.
	 */
	constructor(public readonly name: string) {}

	/**
	 * Abstract method to complete a chat conversation.
	 *
	 * @param messages - An array of chat messages that form the conversation history.
	 * @param options - Optional parameters to modify model behavior.
	 * @returns A ChatMessage object or a promise that resolves to one.
	 */
	abstract complete(
		messages: ChatMessage[],
		options?: GPTOptions | AnthropicOptions,
	): ChatMessage | Promise<ChatMessage>;

	/**
	 * Abstract method to stream a chat conversation.
	 *
	 * @param messages - An array of chat messages that form the conversation history.
	 * @param options - Optional parameters to modify model behavior.
	 * @returns An async iterable of chat message chunks.
	 */
	abstract stream?(
		messages: ChatMessage[],
		options?: GPTOptions | AnthropicOptions,
	): AsyncIterable<ChatMessageChunk>;
}

/**
 * A concrete class representing a standard OpenAI model (non-reasoning).
 *
 * @extends LanguageModel
 */
export class OpenAIModel extends LanguageModel {
	/**
	 * Sends a request to OpenAI's API to complete a chat.
	 *
	 * @param messages - An array of chat messages forming the conversation.
	 * @param options - Optional GPT options to control the response.
	 * @returns A promise that resolves to the assistant's chat message.
	 */
	async complete(
		messages: ChatMessage[],
		options?: GPTOptions,
	): Promise<ChatMessage> {
		const response = await fetch(
			"https://api.openai.com/v1/chat/completions",
			{
				body: JSON.stringify({
					model: this.name,
					messages,
					...options,
				}),
				method: "POST",
				headers: {
					"Authorization": "Bearer " + OPENAI_API_KEY,
					"Content-Type": "application/json",
				},
			},
		);
		const chatResponse: OpenAIChatResponse = await response.json();
		if (!chatResponse.choices) {
			const errorMessage = (chatResponse as any).error?.message ||
				"Unknown OpenAI error";
			console.log(response, response.status, errorMessage);
			throw new ModelError(errorMessage, this.name);
		}
		return chatResponse.choices[0].message;
	}

	/**
	 * Sends a streaming request to OpenAI's API.
	 *
	 * @param messages - An array of chat messages forming the conversation.
	 * @param options - Optional GPT options to control the response.
	 * @returns An async iterable that yields message chunks as they arrive.
	 */
	async *stream(
		messages: ChatMessage[],
		options?: GPTOptions,
	): AsyncIterable<ChatMessageChunk> {
		const response = await fetch(
			"https://api.openai.com/v1/chat/completions",
			{
				body: JSON.stringify({
					model: this.name,
					messages,
					stream: true,
					...options,
				}),
				method: "POST",
				headers: {
					"Authorization": "Bearer " + OPENAI_API_KEY,
					"Content-Type": "application/json",
				},
			},
		);

		if (!response.ok) {
			const errorData = await response.json();
			const errorMessage = errorData.error?.message ||
				"Unknown OpenAI error";
			throw new ModelError(errorMessage, this.name);
		}

		if (!response.body) {
			throw new ModelError("Response body is null", this.name);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder("utf-8");

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split("\n").filter((line) => line.trim() !== "");

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);

						if (data === "[DONE]") break;

						try {
							const parsed = JSON.parse(data);
							if (parsed.choices && parsed.choices.length > 0) {
								yield parsed.choices[0].delta;
							}
						} catch (e) {
							console.error("Error parsing stream data:", e);
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}

/**
 * A concrete class representing an OpenAI model that supports reasoning.
 *
 * @extends OpenAIModel
 */
export class OpenAIReasoningModel extends OpenAIModel {
	constructor(
		public readonly name: string,
		public readonly defaultReasoningEffort?: "low" | "medium" | "high",
	) {
		super(name);
	}

	/**
	 * Sends a request to OpenAI's API to complete a chat with reasoning options.
	 *
	 * If no reasoning effort is provided in the options, the model's default is used.
	 *
	 * @param messages - An array of chat messages forming the conversation.
	 * @param options - Optional GPT options to control the response.
	 * @returns A promise that resolves to the assistant's chat message.
	 */
	async complete(
		messages: ChatMessage[],
		options?: GPTReasoningOptions,
	): Promise<ChatMessage> {
		// If no reasoning effort is provided, inject the default.
		const finalOptions: GPTReasoningOptions = { ...options };

		if (this.defaultReasoningEffort) {
			finalOptions.reasoning_effort = this.defaultReasoningEffort;
		}

		const response = await fetch(
			"https://api.openai.com/v1/chat/completions",
			{
				body: JSON.stringify({
					model: this.name,
					messages,
					...finalOptions,
				}),
				method: "POST",
				headers: {
					"Authorization": "Bearer " + OPENAI_API_KEY,
					"Content-Type": "application/json",
				},
			},
		);
		const chatResponse: OpenAIChatResponse = await response.json();
		if (!chatResponse.choices) {
			const errorMessage = (chatResponse as any).error?.message ||
				"Unknown OpenAI error";
			console.log(response.status, errorMessage);
			throw new ModelError(errorMessage, this.name);
		}
		return chatResponse.choices[0].message;
	}
}

/**
 * A concrete class representing an Anthropic model.
 *
 * @extends LanguageModel
 */
export class AnthropicModel extends LanguageModel {
	/**
	 * Creates an instance of AnthropicModel.
	 *
	 * @param name - The unique name or identifier for the Anthropic model.
	 * @param defaultMaxTokens - The default maximum number of tokens for responses.
	 */
	constructor(
		public readonly name: string,
		public readonly defaultMaxTokens: number = 4000,
	) {
		super(name);
	}

	/**
	 * Sends a request to Anthropic's API to complete a chat.
	 *
	 * @param messages - An array of chat messages forming the conversation.
	 * @param options - Optional Anthropic options to control the response.
	 * @returns A promise that resolves to the assistant's chat message.
	 */
	async complete(
		messages: ChatMessage[],
		options?: AnthropicOptions,
	): Promise<ChatMessage> {
		const requestOptions = {
			model: this.name,
			messages,
			max_tokens: options?.max_tokens || 4000,
			...options,
		};

		const response = await fetch("https://api.anthropic.com/v1/messages", {
			body: JSON.stringify(requestOptions),
			method: "POST",
			headers: {
				"x-api-key": ANTHROPIC_API_KEY ?? "",
				"anthropic-version": "2023-06-01",
				"Content-Type": "application/json",
			},
		});
		const chatResponse = await response.json() as AnthropicChatResponse;
		if (!chatResponse.content) {
			console.log(chatResponse);
			throw new ModelError(
				"Failed to get content from Anthropic API",
				this.name,
			);
		}
		console.log(chatResponse);
		return {
			role: "assistant",
			content: chatResponse.content[0].text,
		};
	}

	/**
	 * Sends a streaming request to Anthropic's API.
	 *
	 * @param messages - An array of chat messages forming the conversation.
	 * @param options - Optional Anthropic options to control the response.
	 * @returns An async iterable that yields message chunks as they arrive.
	 */
	async *stream(
		messages: ChatMessage[],
		options?: AnthropicOptions,
	): AsyncIterable<ChatMessageChunk> {
		const requestOptions = {
			model: this.name,
			messages,
			max_tokens: options?.max_tokens || 4000,
			stream: true,
			...options,
		};

		const response = await fetch("https://api.anthropic.com/v1/messages", {
			body: JSON.stringify(requestOptions),
			method: "POST",
			headers: {
				"x-api-key": ANTHROPIC_API_KEY ?? "",
				"anthropic-version": "2023-06-01",
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new ModelError(
				errorData.error?.message || "Failed to stream from Anthropic API",
				this.name,
			);
		}

		if (!response.body) {
			throw new ModelError("Response body is null", this.name);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder("utf-8");

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split("\n").filter((line) => line.trim() !== "");

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6);

						if (data === "[DONE]") break;

						try {
							const parsed = JSON.parse(data);

							if (parsed.type === "content_block_delta") {
								yield {
									content: parsed.delta?.text,
									delta: { content: parsed.delta?.text },
								};
							}
						} catch (e) {
							console.error("Error parsing Anthropic stream data:", e);
						}
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}

/**
 * A simple human player model that prompts the user for input.
 *
 * @extends LanguageModel
 */
class Human extends LanguageModel {
	/**
	 * Synchronously prompts the human player for their move.
	 *
	 * @param messages - An array of chat messages (ignored in this implementation).
	 * @returns The human player's response as a ChatMessage.
	 */
	complete(messages: ChatMessage[]) {
		const move = prompt("What would you like to do, human?\n");
		return { role: "assistant", content: move ?? "" };
	}

	/**
	 * Implementation of the abstract stream method required by LanguageModel.
	 * Since human interaction isn't streaming, this simply returns the complete response.
	 *
	 * @param messages - An array of chat messages (ignored in this implementation).
	 * @returns An async iterable that yields a single message chunk.
	 */
	async *stream(
		messages: ChatMessage[],
		options?: GPTOptions | AnthropicOptions,
	): AsyncIterable<ChatMessageChunk> {
		const response = this.complete(messages);
		yield {
			content: response.content,
			delta: { content: response.content },
		};
	}
}

/**
 * A singleton instance representing the human player.
 */
export const HumanPlayer = new Human("Human");

/**
 * Helper function to stream responses from an OpenAI model to the console.
 *
 * @param model - The OpenAI model to use.
 * @param messages - The array of chat messages.
 * @param options - Optional parameters for the model.
 */
export async function streamToConsole(
	model: LanguageModel,
	messages: ChatMessage[],
	options?: GPTOptions | AnthropicOptions,
) {
	let result = "";

	if (!model.stream) {
		throw new Error(`Model ${model.name} does not support streaming`);
	}

	const stream = model.stream(messages, options);
	for await (const chunk of stream) {
		const content = chunk.delta?.content || chunk.content || "";
		Deno.stdout.write(new TextEncoder().encode(content));
		result += content;
	}
	Deno.stdout.write(new TextEncoder().encode("\n"));

	return result;
}

/**
 * An enumeration of supported language model names.
 *
 * Each entry corresponds to a model supported by the system.
 */
export enum LanguageModelName {
	"GPT-4 turbo",
	"GPT-4o",
	"GPT-4o-2024-08-06",
	"GPT-4o-latest",
	"GPT-4o mini",
	"GPT-4.5 preview",
	"o1 preview",
	"o1",
	"o1 high",
	"o1 mini",
	"o3 mini",
	"o3 mini high",
	"o3 mini low",
	"GPT-3.5 turbo",
	"Claude 3 Haiku",
	"Claude 3.5 Haiku",
	"Claude 3 Sonnet",
	"Claude 3.5 Sonnet",
	"Claude 3.5 Sonnet (new)",
	"Claude 3.7 Sonnet",
	"Claude 3 Opus",
}

/**
 * A mapping of LanguageModelName enum values to their corresponding LanguageModel instances.
 *
 * This object determines which models are used, including their reasoning capabilities.
 */
export const models: Record<LanguageModelName, LanguageModel> = {
	// o3 models with reasoning.
	[LanguageModelName["o3 mini"]]: new OpenAIReasoningModel("o3-mini"),
	[LanguageModelName["o3 mini high"]]: new OpenAIReasoningModel(
		"o3-mini",
		"high",
	),
	[LanguageModelName["o3 mini low"]]: new OpenAIReasoningModel(
		"o3-mini",
		"low",
	),

	// o1 models with reasoning.
	[LanguageModelName["o1"]]: new OpenAIReasoningModel("o1"),
	[LanguageModelName["o1 high"]]: new OpenAIReasoningModel("o1", "high"),

	// o1 mini uses a standard model (non-reasoning).
	[LanguageModelName["o1 mini"]]: new OpenAIModel("o1-mini"),

	// o1 preview uses a standard model.
	[LanguageModelName["o1 preview"]]: new OpenAIModel("o1-preview"),

	// GPT-4.5
	[LanguageModelName["GPT-4.5 preview"]]: new OpenAIModel("gpt-4.5-preview"),

	// GPT-4o models.
	[LanguageModelName["GPT-4o"]]: new OpenAIModel("gpt-4o-2024-05-13"),
	[LanguageModelName["GPT-4o-2024-08-06"]]: new OpenAIModel(
		"gpt-4o-2024-08-06",
	),
	[LanguageModelName["GPT-4o-latest"]]: new OpenAIModel("chatgpt-4o-latest"),
	[LanguageModelName["GPT-4o mini"]]: new OpenAIModel(
		"gpt-4o-mini-2024-07-18",
	),

	// GPT-4 turbo model.
	[LanguageModelName["GPT-4 turbo"]]: new OpenAIModel("gpt-4-turbo"),

	// GPT-3.5 turbo model.
	[LanguageModelName["GPT-3.5 turbo"]]: new OpenAIModel("gpt-3.5-turbo-0125"),

	// Claude models.
	[LanguageModelName["Claude 3 Haiku"]]: new AnthropicModel(
		"claude-3-haiku-20240307",
	),
	[LanguageModelName["Claude 3.5 Haiku"]]: new AnthropicModel(
		"claude-3-5-haiku-20241022",
	),
	[LanguageModelName["Claude 3 Sonnet"]]: new AnthropicModel(
		"claude-3-sonnet-20240229",
	),
	[LanguageModelName["Claude 3.5 Sonnet"]]: new AnthropicModel(
		"claude-3-5-sonnet-20240620",
	),
	[LanguageModelName["Claude 3.5 Sonnet (new)"]]: new AnthropicModel(
		"claude-3-5-sonnet-20241022",
	),
	[LanguageModelName["Claude 3 Opus"]]: new AnthropicModel(
		"claude-3-opus-20240229",
	),

	[LanguageModelName["Claude 3.7 Sonnet"]]: new AnthropicModel(
		"claude-3-7-sonnet-20250219",
	),
};

/**
 * Helper function to retrieve available OpenAI models.
 *
 * @returns A promise that resolves to an array of OpenAI model information objects.
 */
export const getOpenAIModels = async () => {
	const response = await fetch("https://api.openai.com/v1/models", {
		method: "GET",
		headers: {
			"Authorization": "Bearer " + OPENAI_API_KEY,
			"Content-Type": "application/json",
		},
	});
	const json = (await response.json()).data as OpenAIModelInfo[];
	return json;
};

/**
 * Type representing basic information about an OpenAI model.
 *
 * @property id - The model's identifier.
 * @property object - The type of object returned.
 * @property created - Timestamp for when the model was created.
 * @property owned_by - The owner of the model.
 */
type OpenAIModelInfo = {
	id: string;
	object: string;
	created: number;
	owned_by: string;
};

/**
 * The structure of OpenAI's chat completion API response.
 *
 * @property choices - An array of choices, each containing a message.
 */
type OpenAIChatResponse = {
	choices: {
		message: ChatMessage;
	}[];
};

/**
 * The structure of Anthropic's chat response.
 *
 * @property id - The unique identifier of the response.
 * @property type - The type of message (always "message").
 * @property model - The model used for the response.
 * @property content - An array containing the text content of the response.
 */
type AnthropicChatResponse = {
	id: string;
	type: "message";
	model: string;
	content: {
		type: "text";
		text: "string";
	}[];
};
