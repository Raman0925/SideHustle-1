export interface RerankResult {
  index: number;
  relevanceScore: number;
  content: string;
}

export interface Reranker {
  rerank(
    query: string,
    documents: string[],
    topN?: number
  ): Promise<RerankResult[]>;
}

export function createReranker(apiKey: string): Reranker {
  if (!apiKey) {
    throw new Error("API key is required for Reranker");
  }

  async function rerank(
    query: string,
    documents: string[],
    topN?: number
  ): Promise<RerankResult[]> {
    if (documents.length === 0) return [];

    const response = await fetch("https://api.cohere.com/v1/rerank", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "rerank-english-v3.0",
        query,
        documents,
        top_n: topN ?? Math.min(10, documents.length)
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Cohere Rerank API request failed: ${response.status} ${response.statusText} - ${errText}`);
    }

    const data = await response.json() as {
      results: Array<{
        index: number;
        relevance_score: number;
      }>;
    };

    if (!data?.results) {
      throw new Error("Malformed response from Cohere Rerank API");
    }

    return data.results.map(r => ({
      index: r.index,
      relevanceScore: r.relevance_score,
      content: documents[r.index]
    }));
  }

  return { rerank };
}
