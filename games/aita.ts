import aitaQuestions from "../data/aita/aita.json" with {
	type: "json",
};
import { LanguageModelName } from "../models.ts";
import { models } from "../models.ts";
import { shuffle } from "../utils/shuffle.ts";

// Types
type AITAEntry = {
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

type AITAEntryList = AITAEntry[];

const aitaPostToText = (aita: AITAEntry) => {
    return `${aita.submission_title}
==============
${aita.submission_text}`;
};


const aitaData = (false ? shuffle(aitaQuestions) : aitaQuestions) as AITAEntryList;
console.log(`${aitaData.length} AITA Questions`);

const results: unknown[] = [];

const languageModels = [
    LanguageModelName["GPT-4o mini"],
    // LanguageModelName["o3 mini"],
    // LanguageModelName["GPT-4o"],
    // LanguageModelName["GPT-4.5 preview"],
];

const START = 0;
const COUNT = 2000;
const fileName = `data/aita/aita_judge_combined_${new Date().toISOString().substring(0, 19)}.json`;

for (let i = START; i < START + COUNT; i++) {
    const aitaEntry = aitaPostToText(aitaData[i]);
    console.log(`Question #${i}:`, aitaEntry);

    // Collect AI responses from each language model for this question
    const aiResponses = [];
    for (const lm of languageModels) {
        const modelName: LanguageModelName = lm;
        const result = await models[modelName].complete([
            {
                role: "user",
                content: "Your job is to read reddit Am I The Asshole (AITA) posts, and determine whether or not the person is the asshole. Just provide your answer (YTA, you're the asshole, or NTA, Not The Asshole) first, no ESH or NAH, and then one or two sentences of justification."
            },
            {
                role: "user",
                content: aitaEntry
            }
        ]);

        aiResponses.push({
            model: LanguageModelName[modelName],
            content: result.content,
        });
    }

    // Push the results for the current question, adding the index property
    results.push({
        index: i,
        entry: aitaEntry,
        judgements: {
            reddit: [
                aitaData[i].top_comment_1,
                aitaData[i].top_comment_2,
                aitaData[i].top_comment_3
            ],
            ai: aiResponses,
        },
    });

    // Write the accumulated results to file
    await Deno.writeTextFile(
        fileName,
        JSON.stringify(results, null, "\t")
    );
}
