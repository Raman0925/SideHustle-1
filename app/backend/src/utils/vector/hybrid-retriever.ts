import postgres from 'postgres';
import { VectorStore } from '../vectorStore/vectorStore.js';
import { EmbeddingService } from '../embeddings/embeddingService.js';
import { Reranker } from './reranker.js';
import { reciprocalRankFusion } from './rrf.js';
import { SearchResult } from '../vectorStore/types.js';

type FtsRow = {
  id: string;
  document_id: string;
  content: string;
  metadata: Record<string, unknown> | string;
  rank: number;
};

export interface HybridRetriever {
  retrieve(
    query: string,
    options?: {
      vectorCandidates?: number;
      keywordCandidates?: number;
      finalResults?: number;
    }
  ): Promise<SearchResult[]>;
}

export function createHybridRetriever(
  vectorStore: VectorStore,
  embeddingService: EmbeddingService,
  reranker: Reranker,
  db: postgres.Sql
): HybridRetriever {
  async function retrieve(
    query: string,
    options?: {
      vectorCandidates?: number;
      keywordCandidates?: number;
      finalResults?: number;
    }
  ): Promise<SearchResult[]> {
    const vectorLimit = options?.vectorCandidates ?? 50;
    const keywordLimit = options?.keywordCandidates ?? 50;
    const finalResults = options?.finalResults ?? 5;

    // 1. Vector Search
    const queryEmbedding = await embeddingService.embed(query);
    const vectorResults = await vectorStore.search({
      embedding: queryEmbedding,
      limit: vectorLimit
    });

    // 2. Full Text Search
    const ftsResults = await db<FtsRow[]>`
      SELECT id, document_id, content, metadata,
             ts_rank(to_tsvector('english', content), plainto_tsquery('english', ${query})) AS rank
      FROM document_chunks
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT ${keywordLimit}
    `;

    const keywordResults: SearchResult[] = ftsResults.map(r => ({
      id: r.id,
      documentId: r.document_id,
      content: r.content,
      similarity: Number(r.rank),
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata ?? {})
    }));

    // 3. Merge with RRF
    const fused = reciprocalRankFusion([vectorResults, keywordResults]);

    if (fused.length === 0) {
      return [];
    }

    // 4. Rerank the fused results
    const documentsToRerank = fused.map(f => f.item.content);
    const reranked = await reranker.rerank(query, documentsToRerank);

    // 5. Map back to SearchResult[] and return top N
    return reranked.slice(0, finalResults).map(r => {
      const originalItem = fused[r.index].item;
      return {
        ...originalItem,
        similarity: r.relevanceScore
      };
    });
  }

  return { retrieve };
}
