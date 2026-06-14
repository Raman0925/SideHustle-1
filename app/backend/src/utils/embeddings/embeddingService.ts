import { cosineSimilarity } from './similarity.js';

const VALID_MODELS = ['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'];

export class EmbeddingService {
    constructor(
        private readonly model: string,
    ) {
        if (!VALID_MODELS.includes(model)) {
            throw new Error(`Invalid model: ${model}. Supported models are: ${VALID_MODELS.join(', ')}`);
        }
    }

    private getApiKey(): string {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OPENAI_API_KEY environment variable is not defined");
        }
        return apiKey;
    }

    /**
     * Generates a vector embedding for a single text input using OpenAI's API.
     * Delegates to embedBatch to avoid duplicating API logic.
     * @param text The input text to embed.
     * @returns A promise resolving to the vector embedding (array of numbers).
     */
    public async embed(text: string): Promise<number[]> {
        const results = await this.embedBatch([text]);
        if (results.length === 0) {
            throw new Error("Failed to generate embedding");
        }
        return results[0];
    }

    /**
     * Generates vector embeddings for multiple text inputs in a single batch request.
     * @param texts An array of input texts to embed.
     * @returns A promise resolving to an array of vector embeddings in the original order.
     */
    public async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        const apiKey = this.getApiKey();

        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                input: texts,
                model: this.model,
                encoding_format: "float"
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`OpenAI API request failed: ${response.status} ${response.statusText} - ${errBody}`);
        }

        const data = await response.json() as {
            data: Array<{
                embedding: number[];
                index: number;
                object: string;
            }>;
        };

        if (!data?.data || data.data.length === 0) {
            throw new Error("Malformed response structure from OpenAI API");
        }

        // Maintain the original order by sorting on the index returned by the API
        return data.data
            .sort((a, b) => a.index - b.index)
            .map(item => item.embedding);
    }

    /**
     * Finds the candidate embedding that is most similar to the query embedding using cosine similarity.
     * @param query The query vector.
     * @param candidates An array of candidate vectors.
     * @returns The index of the most similar candidate and its similarity score.
     */
    public findMostSimilar(query: number[], candidates: number[][]): { index: number, similarity: number } {
        if (candidates.length === 0) {
            throw new Error("Candidates list cannot be empty");
        }

        let bestIndex = -1;
        let bestSimilarity = -Infinity;

        for (let i = 0; i < candidates.length; i++) {
            const similarity = cosineSimilarity(query, candidates[i]);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestIndex = i;
            }
        }

        return { index: bestIndex, similarity: bestSimilarity };
    }
}