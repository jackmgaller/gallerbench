// File: games/aidanbench.ts

import { LanguageModelName, models } from "../models.ts";
import { Game, GameStatus } from "../types.ts";

// ------------------------
// AidanBench State & Types
// ------------------------

export interface AidanBenchState {
	question: string;
	responses: string[];
	score: number;
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

// At the top of the file, add a cache for embeddings:
const embeddingCache = new Map<string, number[]>();

export async function computeEmbedding(text: string): Promise<number[]> {
	// Check if the embedding for this text is already cached.
	if (embeddingCache.has(text)) {
		return embeddingCache.get(text)!;
	}

	const apiKey = Deno.env.get("OPENAI_API_KEY");
	if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

	const response = await fetch("https://api.openai.com/v1/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model: "text-embedding-3-large",
			input: text,
		}),
	});

	const json = await response.json();
	if (!json.data || !json.data[0] || !json.data[0].embedding) {
		throw new Error("Embedding API error:" + JSON.stringify(json));
	}
	const embedding = json.data[0].embedding;

	// Cache the result before returning.
	embeddingCache.set(text, embedding);
	return embedding;
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
	const judgePrompt = `Your task is to evaluate the coherence and plausibility of an answer to a given question.
  
  Question: <question>${question}</question>
  Answer: <answer>${answer}</answer>
  
  Based on the following criteria, provide a Coherence and Plausibility Score on a scale of 0 - 100:
  
  0-20: INCOHERENT/NONSENSICAL
  - Answer is completely unrelated to the question
  - Contains logical impossibilities or contradictions
  - Makes claims that defy basic reality
  - Shows no understanding of the question's context
  
  21-40: SEVERELY FLAWED
  - Major logical gaps or inconsistencies
  - Significant misunderstanding of core concepts
  - Contains partially relevant information but mostly incorrect
  - May include some true statements but fails to form a coherent response
  
  41-60: PARTIALLY COHERENT
  - Shows basic understanding of the question
  - Contains some valid points mixed with errors
  - Logic is followable but may have weak connections
  - Answer is relevant but may miss key aspects
  
  61-80: MOSTLY COHERENT
  - Demonstrates clear understanding of the question
  - Logic is sound with minor gaps or inconsistencies
  - Most claims are plausible and well-supported
  - Forms a generally complete and relevant response
  
  81-100: HIGHLY COHERENT
  - Perfectly addresses the question
  - Demonstrates complete logical consistency
  - All claims are plausible and well-grounded
  - Forms a comprehensive and precise response
  
  IMPORTANT: Provide your final Coherence and Plausibility Score as a single integer between 0 and 100, enclosed in <coherence_score></coherence_score> XML tags. For example:
  <coherence_score>75</coherence_score>
  
  Do not include any additional text in your response.`;

	// Use the judge model (o1-mini) from our models mapping.
	const judgeModel = models[LanguageModelName["o3 mini low"]];
	const chatMessages = [{ role: "user", content: judgePrompt }];
	const response = await judgeModel.complete(chatMessages, {
		// temperature: .5,
		// top_p: .05,
	});

	// Extract the number from the XML tags using a regular expression.
	const match = response.content.trim().match(
		/<coherence_score>(\d+)<\/coherence_score>/,
	);
	if (!match) {
		throw new Error(
			"Failed to parse coherence score from response: " +
				response.content,
		);
	}
	const score = parseInt(match[1], 10);
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

export const aidanbenchGame: Game<AidanBenchState, string> = {
	name: "AidanBench",
	version: 1.0,
	prompts: {
		first: (state: AidanBenchState) => {
			return `Welcome to AidanBench!
  Your objective is to generate a wide variety of creative, distinct, and innovative answers to the open-ended question below.
  Every answer should explore a new angle — do not repeat any ideas, phrases, or themes.
  Open-Ended Question: "${state.question}"
  Please provide your very first, original answer.`;
		},
		turn: (state: AidanBenchState) => {
			return `Open-Ended Question: "${state.question}"
 \tNow, please provide another creative and unique answer that introduces a new perspective.
 \tRemember: The goal is to generate as many different answers as possible—avoid any repetition.`;
		},
	},
	answerParserPrompt: null,
	initializeState: (question: string): AidanBenchState => {
		return {
			question,
			responses: [],
			score: 0,
		};
	},
	updateState: (state: AidanBenchState, parsedAnswer: string) => {
		state.responses.push(parsedAnswer);
		state.score += 1;
		return state;
	},
	async evaluateStatus(state: AidanBenchState): Promise<GameStatus> {
		const lastResponse = state.responses[state.responses.length - 1];
		console.log("Computing coherence and novelty");

		const coherencePromise = computeCoherence(state.question, lastResponse);
		const noveltyPromise = computeNovelty(
			lastResponse,
			state.responses.slice(0, -1),
		);

		const [coherence, novelty] = await Promise.all([
			coherencePromise,
			noveltyPromise,
		]);

		console.log(`coherence: ${coherence} | novelty: ${novelty.toFixed(3)}`);
		if (coherence <= COHERENCE_THRESHOLD || novelty <= NOVELTY_THRESHOLD) {
			state.responses.forEach((resp, indx) => {
				console.log(`${indx + 1}. ${resp}`);
			});
			console.log(`${state.responses.length} responses in total`);
			return GameStatus.Win;
		}
		return GameStatus.Ongoing;
	},
};
