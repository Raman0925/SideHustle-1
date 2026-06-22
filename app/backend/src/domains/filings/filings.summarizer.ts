import { FilingSummary, FilingCategory, ImpactDirection } from './filings.types.js';
import { extractStructured } from '../../utils/ai/extract-structured.js';
import { TokenBudgetManager } from '../../utils/tokens/tokenBudgetManager.js';
import { ModelRouter } from '../../utils/ai/model-router.js';
import { CostTracker } from '../../utils/ai/cost-tracker.js';
import { contextBudget } from '../../utils/tokens/types.js';

// ─── Tool definition for structured LLM extraction ────────────────────────────
// Using your existing extractStructured<T>() pattern with forced tool choice.
// This guarantees we always get typed JSON back, never freeform prose.

const FILING_SUMMARY_TOOL = {
  name: 'summarizeFiling',
  description: 'Summarize a stock exchange filing and assess its market impact.',
  input_schema: {
    type: 'object' as const,
    properties: {
      headline: {
        type: 'string',
        description: 'One sentence: what happened. E.g. "Sterlite Tech wins ₹800Cr order to build hyperscaler network for Adani Data Centers"',
      },
      category: {
        type: 'string',
        enum: ['OrderWin', 'Acquisition', 'Fundraise', 'ResultsPositive', 'ResultsNegative', 'Regulatory', 'CapexExpansion', 'Divestment', 'Restructuring', 'Other'],
        description: 'Best category for this filing.',
      },
      materialityScore: {
        type: 'number',
        description: 'Integer 1–10. How likely is this to move the stock price? 10 = certain mover, 1 = negligible.',
      },
      impactDirection: {
        type: 'string',
        enum: ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNCLEAR'],
        description: 'Expected market impact direction.',
      },
      keyEntities: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key entities mentioned: company names, deal amounts, geographies, technologies.',
      },
      whyItMatters: {
        type: 'string',
        description: '2–3 sentences explaining why a retail investor should care about this filing.',
      },
      estimatedDealSize: {
        type: 'string',
        description: 'Deal/order size if mentioned. E.g. "₹800 Crore" or "USD 50M". Omit if not mentioned.',
      },
    },
    required: ['headline', 'category', 'materialityScore', 'impactDirection', 'keyEntities', 'whyItMatters'],
  },
};

interface SummaryToolOutput {
  headline: string;
  category: FilingCategory;
  materialityScore: number;
  impactDirection: ImpactDirection;
  keyEntities: string[];
  whyItMatters: string;
  estimatedDealSize?: string;
}

// Budget for filing summarization — long filings get truncated, not errored
const FILING_SUMMARY_BUDGET: contextBudget = {
  systemPrompt: 500,
  toolDefinitions: 0,
  conversationHistory: 0,
  userMessage: 6000,     // ~4500 words of filing text
  retrievedDocuments: 0,
  responseBudget: 1000,
};

const SYSTEM_PROMPT = `You are a financial analyst specializing in Indian listed companies (NSE/BSE).
Your job is to read stock exchange filings and extract structured market-moving information.
Be precise, factual, and concise. Focus on what matters to investors.
Always use the provided tool — never respond in plain text.`;

export class FilingSummarizer {
  private readonly tokenManager: TokenBudgetManager;
  private readonly modelRouter: ModelRouter;
  private readonly costTracker: CostTracker;

  constructor(private readonly apiKey: string) {
    this.tokenManager = new TokenBudgetManager(FILING_SUMMARY_BUDGET);
    this.modelRouter = new ModelRouter();
    this.costTracker = new CostTracker(this.modelRouter);
  }

  // ── Fetch and extract text from a PDF URL ─────────────────────────────────
  private async fetchPdfText(pdfUrl: string): Promise<string> {
    if (!pdfUrl) return '';

    try {
      const resp = await fetch(pdfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FilingsBot/1.0)',
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!resp.ok) {
        console.warn(`[FilingSummarizer] PDF fetch failed: ${resp.status} for ${pdfUrl}`);
        return '';
      }

      const contentType = resp.headers.get('content-type') ?? '';

      // If it's HTML (some exchange URLs redirect to HTML) extract text naively
      if (contentType.includes('text/html')) {
        const html = await resp.text();
        // Strip HTML tags to get plain text
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }

      // For PDFs: we use dynamic import of pdf-parse (install: npm i pdf-parse)
      // Falls back to empty string if not installed
      if (contentType.includes('application/pdf') || pdfUrl.endsWith('.pdf')) {
        try {
          const buffer = Buffer.from(await resp.arrayBuffer());
          const pdfParse = await import('pdf-parse').then(m => m.default).catch(() => null);
          if (pdfParse) {
            const parsed = await pdfParse(buffer);
            return parsed.text ?? '';
          }
        } catch {
          console.warn(`[FilingSummarizer] pdf-parse not available, using subject only`);
        }
      }

      return '';
    } catch (err) {
      console.warn(`[FilingSummarizer] Could not fetch PDF: ${err}`);
      return '';
    }
  }

  // ── Build the prompt from subject + PDF text ───────────────────────────────
  private buildPrompt(subject: string, pdfText: string): string {
    // Truncate PDF text to fit token budget
    const truncated = this.tokenManager.truncateToFit(pdfText, 5000);

    if (truncated) {
      return `Analyze this NSE/BSE filing:\n\nTitle: ${subject}\n\nFiling Content:\n${truncated}`;
    }

    // No PDF text available — summarize from subject line only
    return `Analyze this NSE/BSE filing announcement:\n\nTitle: ${subject}\n\nNote: Full PDF text was not available. Base your analysis on the title.`;
  }

  // ── Main summarize method ──────────────────────────────────────────────────
  public async summarize(
    subject: string,
    pdfUrl: string,
    exchange: string,
    companyName: string
  ): Promise<FilingSummary> {
    // 1. Fetch PDF text (gracefully degrades to empty string)
    const pdfText = await this.fetchPdfText(pdfUrl);

    // 2. Build prompt
    const prompt = this.buildPrompt(
      `[${exchange}] ${companyName}: ${subject}`,
      pdfText
    );

    // 3. Get model — use Sonnet for material filings (this method is only called for MATERIAL)
    const modelConfig = this.modelRouter.getModel('filing', 'premium');

    // 4. Call extractStructured with forced tool choice — your existing utility
    const result = await extractStructured<SummaryToolOutput>(
      prompt,
      FILING_SUMMARY_TOOL,
      this.apiKey,
      modelConfig.modelName
    );

    // 5. Estimate cost (we don't have exact token count from extractStructured,
    //    so we estimate from prompt length)
    const estimatedInputTokens = this.tokenManager.getTokenCount(prompt + SYSTEM_PROMPT);
    const estimatedOutputTokens = 300; // typical structured output size
    const costMetrics = this.costTracker.track('filings', 'filing', 'premium', {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
    });

    return {
      headline: result.headline,
      category: result.category,
      materialityScore: Math.min(10, Math.max(1, Math.round(result.materialityScore))),
      impactDirection: result.impactDirection,
      keyEntities: result.keyEntities,
      whyItMatters: result.whyItMatters,
      estimatedDealSize: result.estimatedDealSize,
      tokensUsed: estimatedInputTokens + estimatedOutputTokens,
      modelUsed: modelConfig.modelName,
      costUsd: costMetrics.cost,
    };
  }
}
