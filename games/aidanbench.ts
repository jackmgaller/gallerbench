// File: games/aidanbench.ts

import { Game, GameStatus } from "../types.ts";
import { LanguageModel, LanguageModelName, models } from "../models.ts";

// ------------------------
// AidanBench State & Types
// ------------------------

export interface AidanBenchState {
	question: string;
	responses: string[];
	score: number;
}

/**
 * Creates a new AidanBench state.
 *
 * @param question - The open‑ended question for the benchmark.
 * @returns An AidanBenchState object.
 */
export function initializeAidanBenchState(question: string): AidanBenchState {
	return {
		question,
		responses: [],
		score: 0,
	};
}

// ------------------------
// Helper: Cosine Similarity
// ------------------------

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0, normA = 0, normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ------------------------
// Embedding Function
// ------------------------
// Uses OpenAI's embedding endpoint.
// (Ensure that the OPENAI_API_KEY environment variable is set.)

export async function computeEmbedding(text: string): Promise<number[]> {
	const apiKey = Deno.env.get("OPENAI_API_KEY");
	if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
	const response = await fetch("https://api.openai.com/v1/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "text-embedding-ada-002",
			input: text,
		}),
	});
	const json = await response.json();
	if (!json.data || !json.data[0] || !json.data[0].embedding) {
		throw new Error("Embedding API error:" + JSON.stringify(json));
	}
	return json.data[0].embedding;
}

// ------------------------
// Coherence Score
// ------------------------
// Calls the judge model (here, o1-mini) to evaluate the answer’s coherence
// on a scale from 0 to 100. It sends a prompt that instructs the judge to return only a number.
export async function computeCoherence(
	question: string,
	answer: string,
): Promise<number> {
	const judgePrompt =
		`Evaluate the following answer for coherence and plausibility on a scale from 0 to 100.
Question: ${question}
Answer: ${answer}
Return only a single number.`;
	// Use the judge model (o1-mini) from our models mapping.
	const judgeModel = models[LanguageModelName["o1 mini"]];
	// We assume that the judge model’s complete() method returns a ChatMessage.
	const chatMessages = [{ role: "user", content: judgePrompt }];
	const response = await judgeModel.complete(chatMessages);
	// Attempt to parse the returned number.
	const score = parseInt(response.content.trim(), 10);
	if (isNaN(score)) {
		throw new Error(
			"Failed to parse coherence score from response: " +
				response.content,
		);
	}
	return score;
}

// ------------------------
// Novelty Score
// ------------------------
// For a new answer and a list of previous answers, compute the embedding for the new answer,
// then for each previous answer compute the cosine similarity, and finally return novelty as
// 1 minus the maximum cosine similarity.
export async function computeNovelty(
	newAnswer: string,
	previous: string[],
): Promise<number> {
	if (previous.length === 0) return 1.0;
	const newEmb = await computeEmbedding(newAnswer);
	let maxSim = 0;
	// In a real-world system you might cache embeddings for previous answers.
	for (const prev of previous) {
		const prevEmb = await computeEmbedding(prev);
		const sim = cosineSimilarity(newEmb, prevEmb);
		if (sim > maxSim) maxSim = sim;
	}
	return 1 - maxSim;
}

// ------------------------
// Termination Thresholds
// ------------------------
const COHERENCE_THRESHOLD = 15;
const NOVELTY_THRESHOLD = 0.15;

// ------------------------
// AidanBench Game Implementation
// ------------------------

// Note: Because computeCoherence and computeNovelty are asynchronous, the evaluateStatus
// function here returns a Promise<GameStatus>. (Your game loop may need to await this.)
export const aidanbenchGame: Game<AidanBenchState> = {
	name: "AidanBench",
	version: 1.0,
	prompts: {
		first: (state: AidanBenchState) => {
			return `You are now being evaluated on creativity, reliability, and instruction following.
Open-Ended Question: "${state.question}"
Please provide your first, original answer.`;
		},
		turn: (state: AidanBenchState) => {
			const history = state.responses.length > 0
				? "\nPrevious responses:\n" +
					state.responses.map((r, i) => `${i + 1}. ${r}`).join("\n")
				: "";
			return `Open-Ended Question: "${state.question}"${history}
Please provide a new, creative answer that does not repeat any previous response.`;
		},
	},
	answerParserPrompt:
		"Extract only the answer text from the response. Do not include any extra commentary.",
	updateState: (state: AidanBenchState, parsedAnswer: string) => {
		state.responses.push(parsedAnswer);
		state.score += 1;
		return state;
	},
	// Note: evaluateStatus is now asynchronous.
	async evaluateStatus(state: AidanBenchState): Promise<GameStatus> {
		const lastResponse = state.responses[state.responses.length - 1];
		// Compute coherence and novelty scores for the latest answer.
		const coherence = await computeCoherence(state.question, lastResponse);
		const novelty = await computeNovelty(
			lastResponse,
			state.responses.slice(0, -1),
		);
		console.log(
			`Last answer coherence: ${coherence} | novelty: ${
				novelty.toFixed(2)
			}`,
		);
		// Terminate if either score is below its threshold.
		if (coherence <= COHERENCE_THRESHOLD || novelty <= NOVELTY_THRESHOLD) {
			return GameStatus.Win;
		}
		return GameStatus.Ongoing;
	},
};
