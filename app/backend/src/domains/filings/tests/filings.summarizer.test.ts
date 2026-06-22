import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FilingSummarizer, createFilingSummarizer } from '../filings.summarizer.js';
import { extractStructured } from '../../../utils/ai/extract-structured.js';

vi.mock('../../../utils/ai/extract-structured.js', () => {
  return {
    extractStructured: vi.fn(),
  };
});

vi.mock('pdf-parse', () => {
  return {
    default: vi.fn().mockResolvedValue({ text: 'mocked pdf text content' }),
  };
});

describe('FilingSummarizer', () => {
  let summarizer: FilingSummarizer;
  let mockFetch: any;

  beforeEach(() => {
    summarizer = createFilingSummarizer('mock-api-key');
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('summarizes filing from PDF URL successfully', async () => {
    const mockPdfResponse = {
      ok: true,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'application/pdf' : null),
      },
      arrayBuffer: async () => new ArrayBuffer(8),
    };
    mockFetch.mockResolvedValueOnce(mockPdfResponse);

    const mockStructuredResult = {
      headline: 'TCS wins contract',
      category: 'OrderWin',
      materialityScore: 8.4,
      impactDirection: 'POSITIVE',
      keyEntities: ['TCS'],
      whyItMatters: 'Important contract win.',
      estimatedDealSize: '100 Cr',
    };
    vi.mocked(extractStructured).mockResolvedValueOnce(mockStructuredResult);

    const summary = await summarizer.summarize('Big Win', 'http://example.com/test.pdf', 'NSE', 'TCS');

    expect(mockFetch).toHaveBeenCalledWith('http://example.com/test.pdf', expect.any(Object));
    expect(extractStructured).toHaveBeenCalledOnce();
    expect(summary.headline).toBe('TCS wins contract');
    expect(summary.materialityScore).toBe(8);
    expect(summary.impactDirection).toBe('POSITIVE');
    expect(summary.costUsd).toBeGreaterThan(0);
    expect(summary.modelUsed).toBeDefined();
  });

  it('summarizes filing fallback to subject if PDF fetch fails', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } });

    const mockStructuredResult = {
      headline: 'Infosys results update',
      category: 'ResultsPositive',
      materialityScore: 9,
      impactDirection: 'POSITIVE',
      keyEntities: ['Infosys'],
      whyItMatters: 'Good results.',
    };
    vi.mocked(extractStructured).mockResolvedValueOnce(mockStructuredResult);

    const summary = await summarizer.summarize('Results', 'http://example.com/missing.pdf', 'BSE', 'Infosys');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(summary.headline).toBe('Infosys results update');
    expect(summary.materialityScore).toBe(9);
  });

  it('handles HTML response redirects and strips tags', async () => {
    const mockHtmlResponse = {
      ok: true,
      headers: {
        get: (name: string) => (name === 'content-type' ? 'text/html' : null),
      },
      text: async () => '<html><body><div>Redirected content</div></body></html>',
    };
    mockFetch.mockResolvedValueOnce(mockHtmlResponse);

    const mockStructuredResult = {
      headline: 'HTML redirect handled',
      category: 'Other',
      materialityScore: 2.1,
      impactDirection: 'NEUTRAL',
      keyEntities: [],
      whyItMatters: 'Neutral update.',
    };
    vi.mocked(extractStructured).mockResolvedValueOnce(mockStructuredResult);

    const summary = await summarizer.summarize('Subject', 'http://example.com/info', 'NSE', 'Company');

    expect(summary.headline).toBe('HTML redirect handled');
    expect(summary.materialityScore).toBe(2);
  });
});
