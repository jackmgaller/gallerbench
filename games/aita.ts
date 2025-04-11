import { sortObjectByValues } from "gallerlib/utils.ts";
import { AitaCache } from "../cache/aitaCache.ts";
import { LanguageModelName, models } from "../models.ts";

// Load and parse AITA questions JSON file.
const aitaQuestionsText = await Deno.readTextFile(
	"/Users/gallerdude/Desktop/Gallerapps/apps/Gallerbench/data/aita/aita.json",
);
const aitaData = JSON.parse(aitaQuestionsText) as AITAEntry[];

// ===================
// Types & Interfaces
// ===================

export type AITAEntry = {
	submission_text: string;
	submission_title: string;
	submission_score: number;
	submission_url: string;
	submission_date: string;
	top_comment_1: string;
	top_comment_2: string;
	top_comment_3: string;
	top_comment_4: string;
	top_comment_5: string;
	top_comment_6: string;
	top_comment_7: string;
	top_comment_8: string;
	top_comment_9: string;
	top_comment_10: string;
	top_comment_1_AITA_class_by_keyword: number;
	top_comment_2_AITA_class_by_keyword: number;
	top_comment_3_AITA_class_by_keyword: number;
	top_comment_4_AITA_class_by_keyword: number;
	top_comment_5_AITA_class_by_keyword: number;
	top_comment_6_AITA_class_by_keyword: number;
	top_comment_7_AITA_class_by_keyword: number;
	top_comment_8_AITA_class_by_keyword: number;
	top_comment_9_AITA_class_by_keyword: number;
	top_comment_10_AITA_class_by_keyword: number;
	consensus: number;
	toxicity_label: string;
	toxicity_confidence_score: number;
};

type AITAClassification = "YTA" | "NTA" | "ESH" | "NAH" | "Invalid";

export type AITAJudgementEntry = {
	index: number;
	entry: string;
	judgements: {
		reddit: string[];
		ai: {
			model: string;
			content: string;
		}[];
	};
	reddit_classifications?: AITAClassification[];
	ai_classifications?: {
		model: string;
		classification: AITAClassification;
	}[];
};

// ======================
// Helper Functions
// ======================

/**
 * Converts an AITA post into a formatted text block.
 */
const aitaPostToText = (aita: AITAEntry): string =>
	`${aita.submission_title}
==============
${aita.submission_text}`;

/**
 * Helper function to classify a judgement response using the classification model.
 */
async function classifyJudgement(judgement: string) {
	const prompt =
		`We are looking at AITA (Am I The Asshole) posts, and how people judge them in response. The possible responses are "YTA", "NTA", "NAH", "ESH". 

Classify the following judgement response as one of the following categories: "YTA", "NTA", "NAH", or "ESH". If the judgement does not clearly fall into one of those categories, output "Invalid". Just provide one of those strings, nothing before or afterwards, no quotes around them.

Judgement: ${judgement}`;
	const response = await models[LanguageModelName["o3 mini low"]].complete([
		{ role: "user", content: prompt },
	]);
	return response.content.trim() as "YTA" | "NTA" | "NAH" | "ESH" | "Invalid";
}

// Allowed classifications for validation.
const ALLOWED_CLASSIFICATIONS = ["YTA", "NTA", "NAH", "ESH"] as const;

// ======================
// Main Functions
// ======================

/**
 * Process AITA judgements.
 *
 * This function:
 * - Loads the AITA entries (optionally shuffling them),
 * - Iterates over a specified range (using `start` and `count`),
 * - For each entry, converts the post to text, checks the cache, and if needed calls several language models to generate AI responses,
 * - Stores the resulting judgement (both Reddit and AI responses) and updates the cache,
 * - Writes the accumulated results to an output file.
 *
 * @param start - Starting index (default 0)
 * @param count - Number of entries to process (default 1000)
 * @param outputFile - Optional output file name; if not provided one is generated.
 */
export async function processAITAJudgements(
	start = 0,
	count = 1000,
	outputFile?: string,
): Promise<AITAJudgementEntry[]> {
	const data = aitaData as AITAEntry[];
	console.log(`${data.length} AITA Questions`);

	const results: AITAJudgementEntry[] = [];
	const languageModels = [
		LanguageModelName["GPT-4o mini"],
		LanguageModelName["GPT-4o"],
		LanguageModelName["GPT-4.5 preview"],
		LanguageModelName["o3 mini"],
	];
	const fileName = outputFile ||
		`data/aita/aita_judge_combined_${
			new Date()
				.toISOString()
				.substring(0, 19)
		}.json`;

	for (let i = start; i < start + count && i < data.length; i++) {
		const postText = aitaPostToText(data[i]);
		const aiResponses: { model: string; content: string }[] = [];

		// Check cache for the current entry.
		const cacheResult = AitaCache.get(
			postText,
			languageModels.map((lm) => LanguageModelName[lm]),
		);

		if (cacheResult !== null) {
			console.log(`CACHE HIT ${i + 1}`);
			results.push(cacheResult as AITAJudgementEntry);
			continue;
		}

		console.log(`AITA ${i + 1}: ${data[i].submission_title}`);

		// Get judgements from each language model.
		for (const lm of languageModels) {
			const result = await models[lm].complete([
				{
					role: "user",
					content:
						"Your job is to read reddit Am I The Asshole (AITA) posts, and determine whether or not the person is the asshole. Just provide your answer (YTA, you're the asshole, or NTA, Not The Asshole) first, (no ESH or NAH), and then one or two sentences of justification.",
				},
				{ role: "user", content: postText },
			]);
			aiResponses.push({
				model: LanguageModelName[lm],
				content: result.content,
			});
		}

		const resultEntry: AITAJudgementEntry = {
			index: i + 1,
			entry: postText,
			judgements: {
				reddit: [
					data[i].top_comment_1,
					data[i].top_comment_2,
					data[i].top_comment_3,
					data[i].top_comment_4,
					data[i].top_comment_5,
				],
				ai: aiResponses,
			},
		};

		results.push(resultEntry);
		AitaCache.set(
			postText,
			languageModels.map((lm) => LanguageModelName[lm]),
			resultEntry,
		);
		await Deno.writeTextFile(fileName, JSON.stringify(results, null, "\t"));
	}

	console.log(`Processing complete. Results written to ${fileName}`);
	return results;
}

/**
 * Classify human ratings in the provided file.
 *
 * For each entry, this function classifies both Reddit and AI judgements using a language model.
 * It writes progress to an output file.
 */
export async function classifyRatings(
	inputFile: string,
	outputFile?: string,
): Promise<void> {
	const fileContent = await Deno.readTextFile(inputFile);
	const entries: AITAJudgementEntry[] = JSON.parse(fileContent);
	const newFile = outputFile ||
		`data/aita/aita_judge_classified_${
			new Date()
				.toISOString()
				.substring(0, 19)
		}.json`;

	for (const entry of entries) {
		// Process Reddit judgements if not already classified.
		if (!entry.reddit_classifications) {
			const redditClassifications: AITAClassification[] = [];
			let count = 1;
			for (const judgement of entry.judgements.reddit) {
				console.log(
					`Processing Reddit judgement for entry ${entry.index}, judgement ${count++}`,
				);
				const classification = await classifyJudgement(judgement);
				if (
					!ALLOWED_CLASSIFICATIONS.includes(
						classification as typeof ALLOWED_CLASSIFICATIONS[number],
					)
				) {
					console.error(
						`Invalid classification received: "${classification}" for reddit judgement: ${judgement}`,
					);
				}
				redditClassifications.push(classification);
			}
			entry.reddit_classifications = redditClassifications;
		} else {
			console.log(
				`Skipping Reddit classification for entry ${entry.index} (already exists).`,
			);
		}

		// Process AI judgements if not already classified.
		if (!entry.ai_classifications) {
			const aiClassifications: { model: string; classification: "YTA" | "NTA" | "NAH" | "ESH" | "Invalid" }[] = [];
			for (const aiResponse of entry.judgements.ai) {
				console.log(
					`Processing AI judgement from model ${aiResponse.model} for entry ${entry.index}`,
				);
				const classification = await classifyJudgement(aiResponse.content);
				if (
					!ALLOWED_CLASSIFICATIONS.includes(
						classification as typeof ALLOWED_CLASSIFICATIONS[number],
					)
				) {
					console.error(
						`Invalid classification received: "${classification}" for AI judgement from model ${aiResponse.model}`,
					);
				}
				aiClassifications.push({ model: aiResponse.model, classification });
			}
			entry.ai_classifications = aiClassifications;
		} else {
			console.log(
				`Skipping AI classification for entry ${entry.index} (already exists).`,
			);
		}

		await Deno.writeTextFile(newFile, JSON.stringify(entries, null, "\t"));
	}

	console.log(`Classification complete. Results written to ${newFile}`);
}

export function computeAgreementAccuracy(
	data: AITAJudgementEntry[],
): Record<string, number> {
	const results: Record<string, number> = {};
	let n = 0;

	data.forEach((entry) => {
		if (entry.ai_classifications) {
			n++;
			entry.ai_classifications.forEach(({ model, classification }) => {
				entry.reddit_classifications!.forEach((redditClassification) => {
					if (classification === redditClassification) {
						results[model] = (results[model] || 0) + 1;
					}
				});
			});
		}
	});
	console.log({ n });
	return results;
}

export function computeMajorityVoteAccuracy(
	data: AITAJudgementEntry[],
): Record<string, number> {
	const correctCounts: Record<string, number> = {};
	const totalCounts: Record<string, number> = {};

	for (const entry of data) {
		if (!entry.reddit_classifications || !entry.ai_classifications) continue;

		const labelCounts: Record<string, number> = {
			YTA: 0,
			NTA: 0,
			NAH: 0,
			ESH: 0,
		};

		for (const label of entry.reddit_classifications) {
			labelCounts[label] = (labelCounts[label] || 0) + 1;
		}

		let majorityLabel = "YTA";
		let maxCount = 0;
		for (const [label, count] of Object.entries(labelCounts)) {
			if (count > maxCount) {
				maxCount = count;
				majorityLabel = label;
			}
		}

		for (const { model, classification } of entry.ai_classifications) {
			totalCounts[model] = (totalCounts[model] || 0) + 1;
			if (classification === majorityLabel) {
				correctCounts[model] = (correctCounts[model] || 0) + 1;
			}
		}
	}

	const accuracies: Record<string, number> = {};
	for (const model of Object.keys(totalCounts)) {
		accuracies[model] = ((correctCounts[model] || 0) / totalCounts[model]) *
			100;
	}
	return accuracies;
}

const calculateUnanimousHumans = (data: AITAJudgementEntry[]) => {
	let unanimous = 0;

	data.forEach((entry) => {
		if (entry.reddit_classifications!.every((j) => j === entry.reddit_classifications![0])) {
			unanimous++;
		}
	});

	return unanimous;
};

const calculateUnanimousLLMs = (data: AITAJudgementEntry[]) => {
	let unanimous = 0;

	data.forEach((entry) => {
		if (entry.ai_classifications!.every((j) => j.classification === entry.ai_classifications![0].classification)) {
			unanimous++;
		}
	});

	return unanimous;
};

// ======================
// Execution & Logging
// ======================

// await processAITAJudgements();

// await classifyRatings("/Users/gallerdude/Desktop/Gallerapps/apps/Gallerbench/data/aita/aita-04-11T03:16:29-classified.json",
// 	"/Users/gallerdude/Desktop/Gallerapps/apps/Gallerbench/data/aita/aita-04-11T03:16:29-classified-2.json"
// )

const allData = JSON.parse(
	await Deno.readTextFile(
		"/Users/gallerdude/Desktop/Gallerapps/apps/Gallerbench/data/aita/aita-04-11T03:16:29-classified-2.json",
	),
) as AITAJudgementEntry[];

const agreementResults = await computeAgreementAccuracy(allData);
let normalizedAgreementResult: Record<string, string> = Object.fromEntries(
	Object.entries(agreementResults).map(([k, v]) => [
		k,
		((v / 5000) * 100).toFixed(2) + "%",
	]),
);

normalizedAgreementResult = sortObjectByValues(normalizedAgreementResult, (a, b) => {
	return Number.parseFloat(a) - Number.parseFloat(b);
});

console.log("Agreement Accuracy:", normalizedAgreementResult);

const majorityVoteResults = computeMajorityVoteAccuracy(allData);
let normalizedMajorityVoteResult: Record<string, string> = Object.fromEntries(
	Object.entries(majorityVoteResults).map(([k, v]) => [
		k,
		v.toFixed(2) + "%",
	]),
);

normalizedMajorityVoteResult = sortObjectByValues(normalizedMajorityVoteResult, (a, b) => {
	return Number.parseFloat(a) - Number.parseFloat(b);
});

console.log("Majority‐Vote Accuracy:", normalizedMajorityVoteResult);

console.log("Unanimous Humans", calculateUnanimousHumans(allData));
console.log("Unanimous LLMs", calculateUnanimousLLMs(allData));

/**
 * -----------------------------------------------------------------------------
 * EXPLANATION OF WEIGHTED ACCURACY VS. MAJORITY-VOTE ACCURACY
 *
 * 1) Agreement Accuracy:
 *    - For each post, we look at the raw number of responses the model agrees with (e.g., 4 out of 5 say "NTA" → 80%).
 *    - If the model chooses "NTA," it gets 4 points; if it had chosen "YTA," it gets 1 point.
 *    - Advantage: Reflects the degree of human consensus; if the model picks the label that 80% of humans support, it gets more credit than if only 51% of humans had supported that label.
 *    - Disadvantage: Less intuitive than a simple "correct vs. incorrect" metric, and it requires calculating fractional agreement each time.
 *
 * 2) Majority-Vote Accuracy:
 *    - We first determine the label that appears most often among the human votes (e.g., 3 out of 5 say "YTA").
 *    - The model’s prediction is then scored as completely correct (1.0) if it matches that majority label, or 0.0 otherwise.
 *    - Advantage: Very straightforward and easy to understand as a simple "correct vs. incorrect" measure of performance.
 *    - Disadvantage: Treats a 3–2 human split the same as a 5–0 split, so it does not reflect how strong the consensus actually is.
 *
 * -----------------------------------------------------------------------------
 */
