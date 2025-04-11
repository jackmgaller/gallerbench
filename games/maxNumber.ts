import { randomNumber, sleep } from "gallerlib/utils.ts";
import { LanguageModelName, models } from "../models.ts";
import { Cache } from "../cache/cache.ts";

// --- Helper Functions ---

const getMaxNumber = (arr: number[]): number => {
	// Handle empty array explicitly (though runMaxNumberTrial prevents size 0)
	if (arr.length === 0) return -Infinity;
	let maxSoFar = arr[0];
	for (let i = 1; i < arr.length; i++) {
		if (arr[i] > maxSoFar) {
			maxSoFar = arr[i];
		}
	}
	return maxSoFar;
};

// --- Caching and Trial Execution ---

const CACHE_NAME = "maxNumberMultiRun"; // Use a distinct cache name if desired
const cache = new Cache(CACHE_NAME);

interface TrialStats {
	correct: number;
	completed: number;
	accuracy: number;
}

// Updated to include runId for unique caching per benchmark run
async function runMaxNumberTrial(
	runId: number, // Identifier for the overall benchmark run
	modelName: LanguageModelName,
	amountOfNumbersToSearch: number,
	trialIndex: number,
	maxMultiplicationFactor: number,
	allowNegative: boolean,
): Promise<boolean> {
	const modelDisplayName = LanguageModelName[modelName];
	// Include runId in the cache key path
	const cacheKey = `run_${runId}/${modelDisplayName}/size_${amountOfNumbersToSearch}/trial_${trialIndex}`;
	const cachedResult = cache.get(cacheKey);

	if (cachedResult !== null && typeof cachedResult === "boolean") {
		return cachedResult; // Return cached result for this specific run/model/size/trial
	}

	const numbers: number[] = [];
	if (amountOfNumbersToSearch <= 0) {
		cache.set(cacheKey, false);
		return false;
	}

	for (let j = 0; j < amountOfNumbersToSearch; j++) {
		const sign = allowNegative ? (Math.random() < 0.5 ? -1 : 1) : 1;
		const maxNumberToGenerate = Math.max(1, amountOfNumbersToSearch * maxMultiplicationFactor);
		numbers.push(randomNumber(0, maxNumberToGenerate) * sign);
	}

	const actualMaxNumber = getMaxNumber(numbers);
	const prompt =
		`What is the largest number in this list of numbers? Return just the number, no other text or special characters.\nList:\n${
			numbers.join("\n")
		}`;
	const model = models[modelName];
	let isCorrect = false;

	try {
		const response = await model.complete([{ content: prompt, role: "user" }]);
		isCorrect = response.content?.trim() === actualMaxNumber.toString();
	} catch (error) {
		console.error(`\nError [Run ${runId}, ${modelDisplayName}, Size ${amountOfNumbersToSearch}, Trial ${trialIndex}]:`, error.message);
		isCorrect = false; // Count errors as incorrect for this trial
	}

	cache.set(cacheKey, isCorrect); // Cache the result specific to this run
	return isCorrect;
}

// --- Accuracy Calculation (for a single run) ---

// Renamed: Calculates accuracy from cache for a *specific run* and returns stats
function calculateAccuracyFromCache(
	runId: number,
	modelName: LanguageModelName,
	amountOfNumbersToSearch: number,
	totalTrials: number,
): TrialStats {
	const modelDisplayName = LanguageModelName[modelName];
	let correctCount = 0;
	let completedCount = 0;

	for (let trial = 0; trial < totalTrials; trial++) {
		// Use runId in the cache key lookup
		const cacheKey = `run_${runId}/${modelDisplayName}/size_${amountOfNumbersToSearch}/trial_${trial}`;
		const result = cache.get(cacheKey);

		// We expect a result to be present after runMaxNumberTrial completes
		if (result !== null) {
			completedCount++;
			if (result === true) {
				correctCount++;
			}
		} else {
			// This ideally shouldn't happen if runMaxNumberTrial ran successfully before this
			console.warn(`[Run ${runId}] Cache miss during accuracy calculation for key: ${cacheKey}`);
		}
	}

	const accuracy = completedCount > 0 ? correctCount / completedCount : 0;
	return {
		correct: correctCount,
		completed: completedCount,
		accuracy: accuracy,
	};
}

// --- Benchmark Orchestration (Single Run) ---

interface MaxNumberBenchmarkParams {
	modelNames: LanguageModelName[];
	trialsPerSetting: number;
	numbersToSearchList: number[];
	maxMultiplicationFactor: number;
	allowNegativeNumbers: boolean;
}

// Type for the results returned by a single benchmark run
type BenchmarkRunResults = Map<number, Map<LanguageModelName, TrialStats>>;

// Updated to accept runId, run trials, calculate stats, and return them
async function runSingleMaxNumberBenchmark(
	runId: number,
	params: MaxNumberBenchmarkParams,
): Promise<BenchmarkRunResults> {
	const {
		modelNames,
		trialsPerSetting,
		numbersToSearchList,
		maxMultiplicationFactor,
		allowNegativeNumbers,
	} = params;

	console.log(`\n--- Starting Benchmark Run ${runId} ---`);
	const runResults: BenchmarkRunResults = new Map();

	for (const amount of numbersToSearchList) {
		const listSizeLog = amount > 0 ? Math.log10(amount) : -Infinity;
		const listSizeDisplay = amount === 1 ? "1 (10^0)" : `${amount} (~10^${listSizeLog.toFixed(1)})`;
		console.log(` [Run ${runId}] Testing list size: ${listSizeDisplay}`);
		const sizeResults = new Map<LanguageModelName, TrialStats>();
		runResults.set(amount, sizeResults);

		for (const modelName of modelNames) {
			const modelDisplayName = LanguageModelName[modelName];
			console.log(`  [Run ${runId}] Running trials for ${modelDisplayName}... `);

			const trialPromises: Promise<boolean>[] = [];
			for (let trial = 0; trial < trialsPerSetting; trial++) {
				trialPromises.push(runMaxNumberTrial(
					runId, // Pass the current runId
					modelName,
					amount,
					trial,
					maxMultiplicationFactor,
					allowNegativeNumbers,
				));
				await sleep(1000);
			}
			await Promise.all(trialPromises); // Wait for all trials for this model/size/run
			console.log("Calculating accuracy... ");

			// Calculate stats from cache for this specific run
			const stats = calculateAccuracyFromCache(runId, modelName, amount, trialsPerSetting);
			sizeResults.set(modelName, stats); // Store stats for this run

			console.log(`Done. (${stats.correct}/${stats.completed})`);
		}
	}
	console.log(`--- Benchmark Run ${runId} Finished ---`);
	return runResults; // Return the results map for this run
}

// --- Multi-Run Orchestration and Averaging ---

function calculateAndDisplayAverageAccuracy(
	allRunResults: BenchmarkRunResults[],
	params: MaxNumberBenchmarkParams, // Needed to know which models/sizes to average
) {
	console.log("\n--- Averaging Results Across All Runs ---");

	const { modelNames, numbersToSearchList } = params;

	// Structure to hold aggregated data: Map<size, Map<model, {accuracies: number[], completed: number[]}>>
	const aggregatedData = new Map<number, Map<LanguageModelName, { accuracies: number[]; completedCounts: number[] }>>();

	// Initialize aggregation structure
	for (const amount of numbersToSearchList) {
		const sizeMap = new Map<LanguageModelName, { accuracies: number[]; completedCounts: number[] }>();
		for (const modelName of modelNames) {
			sizeMap.set(modelName, { accuracies: [], completedCounts: [] });
		}
		aggregatedData.set(amount, sizeMap);
	}

	// Populate aggregated data from each run's results
	for (const runResult of allRunResults) {
		for (const [amount, sizeResults] of runResult.entries()) {
			if (aggregatedData.has(amount)) {
				for (const [modelName, stats] of sizeResults.entries()) {
					if (aggregatedData.get(amount)?.has(modelName)) {
						aggregatedData.get(amount)?.get(modelName)?.accuracies.push(stats.accuracy);
						aggregatedData.get(amount)?.get(modelName)?.completedCounts.push(stats.completed);
					}
				}
			}
		}
	}

	// Calculate and display averages and standard deviations
	for (const amount of numbersToSearchList) {
		const listSizeLog = amount > 0 ? Math.log10(amount) : -Infinity;
		const listSizeDisplay = amount === 1 ? "1 (10^0)" : `${amount} (~10^${listSizeLog.toFixed(1)})`;
		console.log(`\nAverage Accuracy for List Size: ${listSizeDisplay}`);

		const sizeMap = aggregatedData.get(amount);
		if (!sizeMap) continue;

		for (const modelName of modelNames) {
			const modelData = sizeMap.get(modelName);
			const modelDisplayName = LanguageModelName[modelName];
			const paddedModelName = modelDisplayName.padEnd(20, " "); // Adjust padding if needed

			if (!modelData || modelData.accuracies.length === 0) {
				console.log(`  Model ${paddedModelName}: No data found across runs.`);
				continue;
			}

			const n = modelData.accuracies.length;
			const sumAccuracy = modelData.accuracies.reduce((a, b) => a + b, 0);
			const avgAccuracy = sumAccuracy / n;

			// Calculate Standard Deviation
			const mean = avgAccuracy;
			const variance = modelData.accuracies.reduce((sqDiffSum, acc) => sqDiffSum + Math.pow(acc - mean, 2), 0) / n;
			const stdDev = Math.sqrt(variance);

			// Calculate average completed trials
			const sumCompleted = modelData.completedCounts.reduce((a, b) => a + b, 0);
			const avgCompleted = sumCompleted / n;

			console.log(
				`  Model ${paddedModelName}: Avg Accuracy: ${(avgAccuracy * 100).toFixed(1)}% (StdDev: ${
					(stdDev * 100).toFixed(1)
				}%) over ${n} runs (Avg completed trials: ${avgCompleted.toFixed(1)}/${params.trialsPerSetting})`,
			);
		}
	}
}

// --- Main Execution ---

async function runExperiment() {
	const numberOfRuns = 2; // <--- Set how many times to run the full benchmark

	const benchmarkParameters: MaxNumberBenchmarkParams = {
		modelNames: [
			LanguageModelName["GPT-4o mini"],
			LanguageModelName["GPT-4o"],
			LanguageModelName["GPT-4.5 preview"], // Add models as needed
			LanguageModelName["o3 mini"],
		],
		trialsPerSetting: 5, // Trials per model/size *within* each run
		numbersToSearchList: [1, 2, 3, 4].map((x) => Math.round(Math.pow(10, x))), // e.g., [10, 100, 1000]
		maxMultiplicationFactor: 20,
		allowNegativeNumbers: false,
	};

	const allResults: BenchmarkRunResults[] = [];

	for (let i = 0; i < numberOfRuns; i++) {
		const runId = i; // Simple 0-based index for run ID
		const results = await runSingleMaxNumberBenchmark(runId, benchmarkParameters);
		allResults.push(results);
	}

	// Now calculate and display the averages
	calculateAndDisplayAverageAccuracy(allResults, benchmarkParameters);

	console.log("\nExperiment finished.");
	console.log(`Cache file used: ${cache.getCacheFilePath()}`);
}

// Execute the experiment
runExperiment();
