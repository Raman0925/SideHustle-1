import { ClassificationResult, FilingTier, Confidence } from './filings.types.js';

// ─── Keyword lists ─────────────────────────────────────────────────────────────
// These drive the rule-based classifier — no LLM call, runs in <1ms.
// Tuned for Indian listed company announcement language.

const MATERIAL_KEYWORDS: string[] = [
  // Order wins
  'order', 'contract', 'awarded', 'letter of intent', 'loi', 'work order',
  'purchase order', 'supply agreement', 'framework agreement',
  // M&A
  'acquisition', 'merger', 'demerger', 'amalgamation', 'takeover',
  'stake', 'shareholding', 'strategic investment', 'joint venture',
  // Fundraise
  'fundraise', 'fund raise', 'rights issue', 'preferential allotment',
  'qip', 'fpo', 'ipo', 'ncd', 'bond issue', 'fundraising',
  // Capex / expansion
  'capex', 'capital expenditure', 'expansion', 'greenfield', 'brownfield',
  'new facility', 'capacity expansion', 'plant',
  // Infra / tech themes
  'hyperscaler', 'data center', 'tower', '5g', 'fiber', 'submarine cable',
  'cloud', 'colocation',
  // Distress / regulatory
  'nclt', 'insolvency', 'default', 'rating downgrade', 'rating upgrade',
  'sebi order', 'regulatory action', 'show cause', 'penalty',
  // Corporate actions
  'divestment', 'divestiture', 'asset sale', 'business transfer',
  'delisting', 'buyback', 'open offer',
];

const ROUTINE_KEYWORDS: string[] = [
  'board meeting notice',
  'change of address',
  'change of auditor',
  'change of registrar',
  'annual general meeting', 'agm',
  'extraordinary general meeting', 'egm',
  'trading window closure', 'trading window',
  'book closure',
  'record date',
  'loss of share certificate',
  'intimation of loss',
  'newspaper publication',
  'submission of certificate',
  'appointment of compliance officer',
  'change in key managerial',
  'secretarial compliance report',
  'investor grievance',
];

// ─── Classifier ───────────────────────────────────────────────────────────────
// Stage 1: Rule-based (always runs, <1ms, no LLM call)
// Stage 2: WATCH tier filings can optionally go to Haiku for a second opinion
//          (handled in filings.service.ts, not here)

export class FilingClassifier {

  public classify(subject: string, filingType: string): ClassificationResult {
    const text = `${subject} ${filingType}`.toLowerCase();

    const matchedMaterial: string[] = [];
    const matchedRoutine: string[] = [];

    for (const kw of MATERIAL_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) {
        matchedMaterial.push(kw);
      }
    }

    for (const kw of ROUTINE_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) {
        matchedRoutine.push(kw);
      }
    }

    // ── Decision logic ──────────────────────────────────────────────────────
    // MATERIAL + HIGH: strong material signal, no routine overlap
    if (matchedMaterial.length >= 2 && matchedRoutine.length === 0) {
      return {
        tier: 'MATERIAL',
        confidence: 'HIGH',
        matchedKeywords: matchedMaterial,
        reason: `Matched ${matchedMaterial.length} material keywords: ${matchedMaterial.slice(0, 3).join(', ')}`,
      };
    }

    // MATERIAL + LOW: some material signal but ambiguous
    if (matchedMaterial.length === 1 && matchedRoutine.length === 0) {
      return {
        tier: 'MATERIAL',
        confidence: 'LOW',
        matchedKeywords: matchedMaterial,
        reason: `Weak material signal: "${matchedMaterial[0]}" — needs LLM verification`,
      };
    }

    // ROUTINE + HIGH: clear routine signal, no material overlap
    if (matchedRoutine.length >= 1 && matchedMaterial.length === 0) {
      return {
        tier: 'ROUTINE',
        confidence: 'HIGH',
        matchedKeywords: matchedRoutine,
        reason: `Routine filing: ${matchedRoutine[0]}`,
      };
    }

    // WATCH: mixed signals or no clear match — send to Haiku
    if (matchedMaterial.length > 0 && matchedRoutine.length > 0) {
      return {
        tier: 'WATCH',
        confidence: 'LOW',
        matchedKeywords: [...matchedMaterial, ...matchedRoutine],
        reason: `Mixed signals — material: [${matchedMaterial.join(', ')}], routine: [${matchedRoutine.join(', ')}]`,
      };
    }

    // No keyword match at all — WATCH with LOW confidence
    return {
      tier: 'WATCH',
      confidence: 'LOW',
      matchedKeywords: [],
      reason: 'No keyword match — needs LLM classification',
    };
  }
}
