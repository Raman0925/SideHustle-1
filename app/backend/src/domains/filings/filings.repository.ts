import postgres from 'postgres';
import { ProcessedFiling, FilingSummary } from './filings.types.js';

// ─── Filings Repository ───────────────────────────────────────────────────────
// All DB access for the filings domain lives here.
// Uses the same `postgres` sql tagged template pattern as the rest of your app.

export class FilingsRepository {
  constructor(private readonly db: postgres.Sql) {}

  // ── Check if a filing already exists (content-hash dedup) ─────────────────
  public async existsByHash(contentHash: string): Promise<boolean> {
    const result = await this.db<{ count: string }[]>`
      SELECT COUNT(*) as count FROM filings WHERE content_hash = ${contentHash}
    `;
    return parseInt(result[0]?.count ?? '0') > 0;
  }

  // ── Insert a new filing ────────────────────────────────────────────────────
  public async insert(params: {
    exchange: string;
    symbol: string;
    companyName: string;
    filingType: string;
    subject: string;
    filedAt: Date;
    tier: string;
    pdfUrl: string;
    isDuplicate: boolean;
    duplicateOf?: string;
    contentHash: string;
    rawPayload: Record<string, unknown>;
  }): Promise<string> {
    const [result] = await this.db<{ id: string }[]>`
      INSERT INTO filings (
        exchange, symbol, company_name, filing_type, subject,
        filed_at, tier, pdf_url, is_duplicate, duplicate_of,
        content_hash, raw_payload
      ) VALUES (
        ${params.exchange}, ${params.symbol}, ${params.companyName},
        ${params.filingType}, ${params.subject}, ${params.filedAt},
        ${params.tier}, ${params.pdfUrl}, ${params.isDuplicate},
        ${params.duplicateOf ?? null}, ${params.contentHash},
        ${JSON.stringify(params.rawPayload)}
      )
      RETURNING id
    `;
    if (!result) throw new Error('Failed to insert filing');
    return result.id;
  }

  // ── Insert LLM summary for a filing ───────────────────────────────────────
  public async insertSummary(filingId: string, summary: FilingSummary): Promise<void> {
    await this.db`
      INSERT INTO filing_summaries (
        filing_id, headline, category, materiality_score,
        impact_direction, key_entities, why_it_matters,
        estimated_deal_size, tokens_used, cost_usd, model_used
      ) VALUES (
        ${filingId}, ${summary.headline}, ${summary.category},
        ${summary.materialityScore}, ${summary.impactDirection},
        ${summary.keyEntities}, ${summary.whyItMatters},
        ${summary.estimatedDealSize ?? null}, ${summary.tokensUsed},
        ${summary.costUsd}, ${summary.modelUsed}
      )
    `;
  }

  // ── Store embedding for semantic dedup + search ────────────────────────────
  public async insertEmbedding(filingId: string, embedding: number[]): Promise<void> {
    await this.db`
      INSERT INTO filing_embeddings (filing_id, embedding)
      VALUES (${filingId}, ${`[${embedding.join(',')}]`}::vector)
    `;
  }

  // ── Semantic dedup: find similar filings from last 24h ────────────────────
  // Returns filings with cosine similarity > threshold (1 - distance)
  public async findSimilar(
    embedding: number[],
    symbol: string,
    thresholdSimilarity = 0.92,
    withinHours = 24
  ): Promise<{ id: string; similarity: number }[]> {
    const results = await this.db<{ id: string; similarity: number }[]>`
      SELECT f.id, 1 - (fe.embedding <=> ${`[${embedding.join(',')}]`}::vector) AS similarity
      FROM filing_embeddings fe
      JOIN filings f ON f.id = fe.filing_id
      WHERE f.symbol = ${symbol}
        AND f.filed_at >= NOW() - (${withinHours} * INTERVAL '1 hour')
        AND 1 - (fe.embedding <=> ${`[${embedding.join(',')}]`}::vector) >= ${thresholdSimilarity}
      ORDER BY similarity DESC
      LIMIT 5
    `;
    return results;
  }

  // ── Fetch recent filings for dashboard ────────────────────────────────────
  public async findRecent(limit = 50): Promise<ProcessedFiling[]> {
    const rows = await this.db<any[]>`
      SELECT
        f.id, f.exchange, f.symbol, f.company_name, f.filing_type,
        f.subject, f.filed_at, f.tier, f.pdf_url,
        f.is_duplicate, f.duplicate_of, f.created_at,
        fs.headline, fs.category, fs.materiality_score,
        fs.impact_direction, fs.key_entities, fs.why_it_matters,
        fs.estimated_deal_size, fs.tokens_used, fs.cost_usd, fs.model_used
      FROM filings f
      LEFT JOIN filing_summaries fs ON fs.filing_id = f.id
      WHERE f.is_duplicate = false
      ORDER BY f.filed_at DESC
      LIMIT ${limit}
    `;
    return rows.map(this.mapRow);
  }

  // ── Fetch only MATERIAL filings with summaries ─────────────────────────────
  public async findMaterial(limit = 20): Promise<ProcessedFiling[]> {
    const rows = await this.db<any[]>`
      SELECT
        f.id, f.exchange, f.symbol, f.company_name, f.filing_type,
        f.subject, f.filed_at, f.tier, f.pdf_url,
        f.is_duplicate, f.duplicate_of, f.created_at,
        fs.headline, fs.category, fs.materiality_score,
        fs.impact_direction, fs.key_entities, fs.why_it_matters,
        fs.estimated_deal_size, fs.tokens_used, fs.cost_usd, fs.model_used
      FROM filings f
      INNER JOIN filing_summaries fs ON fs.filing_id = f.id
      WHERE f.tier = 'MATERIAL' AND f.is_duplicate = false
      ORDER BY f.filed_at DESC
      LIMIT ${limit}
    `;
    return rows.map(this.mapRow);
  }

  // ── Single filing by ID ────────────────────────────────────────────────────
  public async findById(id: string): Promise<ProcessedFiling | null> {
    const rows = await this.db<any[]>`
      SELECT
        f.id, f.exchange, f.symbol, f.company_name, f.filing_type,
        f.subject, f.filed_at, f.tier, f.pdf_url,
        f.is_duplicate, f.duplicate_of, f.created_at,
        fs.headline, fs.category, fs.materiality_score,
        fs.impact_direction, fs.key_entities, fs.why_it_matters,
        fs.estimated_deal_size, fs.tokens_used, fs.cost_usd, fs.model_used
      FROM filings f
      LEFT JOIN filing_summaries fs ON fs.filing_id = f.id
      WHERE f.id = ${id}
    `;
    if (!rows[0]) return null;
    return this.mapRow(rows[0]);
  }

  // ── Today's cost stats ─────────────────────────────────────────────────────
  public async getTodayStats(): Promise<{
    totalFilings: number;
    materialCount: number;
    watchCount: number;
    routineCount: number;
    duplicateCount: number;
    totalCostUsd: number;
  }> {
    const [stats] = await this.db<any[]>`
      SELECT
        COUNT(*) FILTER (WHERE is_duplicate = false) AS total_filings,
        COUNT(*) FILTER (WHERE tier = 'MATERIAL' AND is_duplicate = false) AS material_count,
        COUNT(*) FILTER (WHERE tier = 'WATCH' AND is_duplicate = false) AS watch_count,
        COUNT(*) FILTER (WHERE tier = 'ROUTINE' AND is_duplicate = false) AS routine_count,
        COUNT(*) FILTER (WHERE is_duplicate = true) AS duplicate_count,
        COALESCE(SUM(fs.cost_usd), 0) AS total_cost_usd
      FROM filings f
      LEFT JOIN filing_summaries fs ON fs.filing_id = f.id
      WHERE f.created_at >= CURRENT_DATE
    `;
    return {
      totalFilings: parseInt(stats.total_filings ?? '0'),
      materialCount: parseInt(stats.material_count ?? '0'),
      watchCount: parseInt(stats.watch_count ?? '0'),
      routineCount: parseInt(stats.routine_count ?? '0'),
      duplicateCount: parseInt(stats.duplicate_count ?? '0'),
      totalCostUsd: parseFloat(stats.total_cost_usd ?? '0'),
    };
  }

  // ── Map DB row to ProcessedFiling ──────────────────────────────────────────
  private mapRow(row: any): ProcessedFiling {
    const summary: FilingSummary | undefined = row.headline
      ? {
          headline: row.headline,
          category: row.category,
          materialityScore: row.materiality_score,
          impactDirection: row.impact_direction,
          keyEntities: row.key_entities ?? [],
          whyItMatters: row.why_it_matters,
          estimatedDealSize: row.estimated_deal_size ?? undefined,
          tokensUsed: row.tokens_used ?? 0,
          modelUsed: row.model_used ?? '',
          costUsd: parseFloat(row.cost_usd ?? '0'),
        }
      : undefined;

    return {
      id: row.id,
      exchange: row.exchange,
      symbol: row.symbol,
      companyName: row.company_name,
      filingType: row.filing_type,
      subject: row.subject,
      filedAt: new Date(row.filed_at),
      tier: row.tier,
      pdfUrl: row.pdf_url,
      isDuplicate: row.is_duplicate,
      duplicateOf: row.duplicate_of ?? undefined,
      summary,
      createdAt: new Date(row.created_at),
    };
  }
}
