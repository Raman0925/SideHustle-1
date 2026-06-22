// ─── Raw filing as it comes off the exchange ─────────────────────────────────
export interface RawFiling {
  exchange: 'NSE' | 'BSE';
  companyName: string;
  symbol: string;
  isin?: string;
  filingType: string;        // raw category from exchange e.g. "Corp. Action"
  subject: string;           // announcement title
  pdfUrl: string;
  filedAt: Date;
  rawPayload: Record<string, unknown>;  // never throw away the original
}

// ─── Classification result ────────────────────────────────────────────────────
export type FilingTier = 'MATERIAL' | 'WATCH' | 'ROUTINE';
export type Confidence = 'HIGH' | 'LOW';

export interface ClassificationResult {
  tier: FilingTier;
  confidence: Confidence;
  matchedKeywords: string[];
  reason: string;
}

// ─── LLM summary (only for MATERIAL filings) ─────────────────────────────────
export type FilingCategory =
  | 'OrderWin'
  | 'Acquisition'
  | 'Fundraise'
  | 'ResultsPositive'
  | 'ResultsNegative'
  | 'Regulatory'
  | 'CapexExpansion'
  | 'Divestment'
  | 'Restructuring'
  | 'Other';

export type ImpactDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNCLEAR';

export interface FilingSummary {
  headline: string;             // one line: what happened
  category: FilingCategory;
  materialityScore: number;     // 1–10
  impactDirection: ImpactDirection;
  keyEntities: string[];        // companies, amounts, geographies
  whyItMatters: string;         // 2–3 sentences plain English
  estimatedDealSize?: string;
  tokensUsed: number;
  modelUsed: string;
  costUsd: number;
}

// ─── Fully processed filing stored in DB ─────────────────────────────────────
export interface ProcessedFiling {
  id: string;
  exchange: 'NSE' | 'BSE';
  symbol: string;
  companyName: string;
  filingType: string;
  subject: string;
  filedAt: Date;
  tier: FilingTier;
  pdfUrl: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  summary?: FilingSummary;
  createdAt: Date;
}
