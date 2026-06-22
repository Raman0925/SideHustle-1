import crypto from 'crypto';
import { NSEPoller, BSEPoller, createNSEPoller, createBSEPoller } from './filings.poller.js';
import { FilingClassifier, createFilingClassifier } from './filings.classifier.js';
import { FilingSummarizer, createFilingSummarizer } from './filings.summarizer.js';
import { FilingsRepository, createFilingsRepository } from './filings.repository.js';
import { EmbeddingService, createEmbeddingService } from '../../utils/embeddings/embeddingService.js';
import { RawFiling, ProcessedFiling } from './filings.types.js';

// ─── FilingsService ───────────────────────────────────────────────────────────
// Orchestrates the full pipeline:
//   Poll → Dedup → Classify → [Summarize if MATERIAL] → Store

export interface FilingsService {
  runPollCycle(): Promise<{ nse: number; bse: number }>;
  startPolling(intervalMs?: number): void;
  stopPolling(): void;
  getRecentFilings(limit?: number): Promise<ProcessedFiling[]>;
  getMaterialFilings(limit?: number): Promise<ProcessedFiling[]>;
  getFilingById(id: string): Promise<ProcessedFiling | null>;
  getTodayStats(): Promise<{
    totalFilings: number;
    materialCount: number;
    watchCount: number;
    routineCount: number;
    duplicateCount: number;
    totalCostUsd: number;
  }>;
  getPollingStatus(): { isPolling: boolean };
}

export function createFilingsService(
  repository: FilingsRepository,
  summarizer: FilingSummarizer,
  embeddingService: EmbeddingService
): FilingsService {
  let service: FilingsService;
  const nsePoller = createNSEPoller();
  const bsePoller = createBSEPoller();
  const classifier = createFilingClassifier();

  let isPolling = false;
  let pollIntervalHandle: NodeJS.Timeout | null = null;

  // ── Content hash for exact dedup ──────────────────────────────────────────
  // Hash = symbol + subject + filedAt — same content from NSE and BSE will have
  // different hashes intentionally. Semantic dedup handles cross-exchange dedup.
  function contentHash(filing: RawFiling): string {
    const raw = `${filing.exchange}:${filing.symbol}:${filing.subject}:${filing.filedAt.toISOString().slice(0, 16)}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  // ── Process a single raw filing through the full pipeline ─────────────────
  async function processFiling(raw: RawFiling): Promise<void> {
    try {
      // Stage 1: Content-hash dedup — drop if we've seen this exact filing
      const hash = contentHash(raw);
      const alreadyExists = await repository.existsByHash(hash);
      if (alreadyExists) return;

      // Stage 2: Classify — rule-based, <1ms, no LLM call
      const classification = classifier.classify(raw.subject, raw.filingType);

      // Stage 3: Embed subject for semantic dedup + future search
      let embedding: number[] = [];
      let isDuplicate = false;
      let duplicateOf: string | undefined;

      try {
        embedding = await embeddingService.embed(raw.subject);

        // Semantic dedup: check if same announcement already arrived from other exchange
        // Two announcements are the same if cosine similarity > 0.92 for same symbol
        const similar = await repository.findSimilar(embedding, raw.symbol, 0.92, 24);
        if (similar.length > 0) {
          isDuplicate = true;
          duplicateOf = similar[0].id;
          console.log(
            `[FilingsService] Semantic duplicate detected: ${raw.exchange} "${raw.subject.slice(0, 60)}" ` +
            `matches existing filing ${duplicateOf} (similarity: ${similar[0].similarity.toFixed(3)})`
          );
        }
      } catch (embErr) {
        console.warn('[FilingsService] Embedding failed, skipping semantic dedup:', embErr);
      }

      // Stage 4: Persist filing to DB
      const filingId = await repository.insert({
        exchange: raw.exchange,
        symbol: raw.symbol,
        companyName: raw.companyName,
        filingType: raw.filingType,
        subject: raw.subject,
        filedAt: raw.filedAt,
        tier: classification.tier,
        pdfUrl: raw.pdfUrl,
        isDuplicate,
        duplicateOf,
        contentHash: hash,
        rawPayload: raw.rawPayload,
      });

      // Stage 5: Store embedding
      if (embedding.length > 0) {
        await repository.insertEmbedding(filingId, embedding);
      }

      // Stage 6: LLM summarization — ONLY for MATERIAL, non-duplicate filings
      if (classification.tier === 'MATERIAL' && !isDuplicate) {
        console.log(
          `[FilingsService] Summarizing MATERIAL filing: [${raw.exchange}] "${raw.subject.slice(0, 80)}" ` +
          `(confidence: ${classification.confidence})`
        );

        try {
          const summary = await summarizer.summarize(
            raw.subject,
            raw.pdfUrl,
            raw.exchange,
            raw.companyName
          );
          await repository.insertSummary(filingId, summary);

          console.log(
            `[FilingsService] Summary done: "${summary.headline}" ` +
            `[score: ${summary.materialityScore}/10, ${summary.impactDirection}] ` +
            `cost: $${summary.costUsd.toFixed(5)}`
          );
        } catch (summaryErr) {
          console.error('[FilingsService] Summarization failed:', summaryErr);
          // Don't rethrow — filing is already saved, summary is optional
        }
      }

      const logTier = isDuplicate ? 'DUPLICATE' : classification.tier;
      console.log(
        `[FilingsService] Processed: [${raw.exchange}] [${logTier}] "${raw.subject.slice(0, 60)}"`
      );
    } catch (err) {
      console.error(`[FilingsService] Failed to process filing "${raw.subject}":`, err);
      // Don't rethrow — one bad filing shouldn't stop the pipeline
    }
  }

  // ── Single poll cycle ──────────────────────────────────────────────────────
  async function runPollCycle(): Promise<{ nse: number; bse: number }> {
    // Poll NSE and BSE concurrently
    const [nseFilings, bseFilings] = await Promise.allSettled([
      nsePoller.poll(),
      bsePoller.poll(),
    ]);

    const nse = nseFilings.status === 'fulfilled' ? nseFilings.value : [];
    const bse = bseFilings.status === 'fulfilled' ? bseFilings.value : [];

    if (nseFilings.status === 'rejected') {
      console.error('[FilingsService] NSE poll error:', nseFilings.reason);
    }
    if (bseFilings.status === 'rejected') {
      console.error('[FilingsService] BSE poll error:', bseFilings.reason);
    }

    const allFilings = [...nse, ...bse];

    // Process all filings sequentially to avoid DB race conditions on dedup
    for (const filing of allFilings) {
      await processFiling(filing);
    }

    return { nse: nse.length, bse: bse.length };
  }

  // ── Start continuous polling ───────────────────────────────────────────────
  function startPolling(intervalMs = 90_000): void {
    if (isPolling) {
      console.warn('[FilingsService] Already polling');
      return;
    }

    isPolling = true;
    console.log(`[FilingsService] Starting polling every ${intervalMs / 1000}s`);

    // Run immediately then on interval
    service.runPollCycle().catch(err => console.error('[FilingsService] Initial poll failed:', err));

    pollIntervalHandle = setInterval(() => {
      service.runPollCycle().catch(err => console.error('[FilingsService] Poll cycle failed:', err));
    }, intervalMs);
  }

  // ── Stop polling ───────────────────────────────────────────────────────────
  function stopPolling(): void {
    if (pollIntervalHandle) {
      clearInterval(pollIntervalHandle);
      pollIntervalHandle = null;
    }
    isPolling = false;
    console.log('[FilingsService] Polling stopped');
  }

  // ── Dashboard queries (delegate to repository) ─────────────────────────────
  async function getRecentFilings(limit = 50): Promise<ProcessedFiling[]> {
    return repository.findRecent(limit);
  }

  async function getMaterialFilings(limit = 20): Promise<ProcessedFiling[]> {
    return repository.findMaterial(limit);
  }

  async function getFilingById(id: string): Promise<ProcessedFiling | null> {
    return repository.findById(id);
  }

  async function getTodayStats() {
    return repository.getTodayStats();
  }

  function getPollingStatus() {
    return { isPolling: isPolling };
  }

  service = {
    runPollCycle,
    startPolling,
    stopPolling,
    getRecentFilings,
    getMaterialFilings,
    getFilingById,
    getTodayStats,
    getPollingStatus
  };

  return service;
}

// ─── Singleton ─────────────────────────────────────────────────────────────────
// Same pattern as chat.service.ts — class + singleton + exported standalone fns
import postgres from 'postgres';

const db = postgres(process.env.DATABASE_URL || '', {
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

const repository = createFilingsRepository(db);
const summarizer = createFilingSummarizer(process.env.ANTHROPIC_API_KEY || '');
const embeddingService = createEmbeddingService('text-embedding-3-small');

export const filingsService = createFilingsService(repository, summarizer, embeddingService);

// Standalone exports
export const startFilingsPolling = (intervalMs?: number) => filingsService.startPolling(intervalMs);
export const stopFilingsPolling = () => filingsService.stopPolling();
export const getRecentFilings = (limit?: number) => filingsService.getRecentFilings(limit);
export const getMaterialFilings = (limit?: number) => filingsService.getMaterialFilings(limit);
export const getFilingById = (id: string) => filingsService.getFilingById(id);
export const getTodayStats = () => filingsService.getTodayStats();
export const runPollCycle = () => filingsService.runPollCycle();
