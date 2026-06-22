import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockNsePoll, mockBsePoll, mockClassify } = vi.hoisted(() => {
  return {
    mockNsePoll: vi.fn(),
    mockBsePoll: vi.fn(),
    mockClassify: vi.fn(),
  };
});

vi.mock('../filings.poller.js', () => {
  return {
    NSEPoller: vi.fn().mockImplementation(() => ({
      poll: mockNsePoll,
    })),
    BSEPoller: vi.fn().mockImplementation(() => ({
      poll: mockBsePoll,
    })),
  };
});

vi.mock('../filings.classifier.js', () => {
  return {
    FilingClassifier: vi.fn().mockImplementation(() => ({
      classify: mockClassify,
    })),
  };
});

import { FilingsService } from '../filings.service.js';

describe('FilingsService', () => {
  let repository: any;
  let summarizer: any;
  let embeddingService: any;
  let service: FilingsService;

  beforeEach(() => {
    repository = {
      existsByHash: vi.fn().mockResolvedValue(false),
      insert: vi.fn().mockResolvedValue('default_id'),
      insertSummary: vi.fn().mockResolvedValue(undefined),
      insertEmbedding: vi.fn().mockResolvedValue(undefined),
      findSimilar: vi.fn().mockResolvedValue([]),
      findRecent: vi.fn(),
      findMaterial: vi.fn(),
      findById: vi.fn(),
      getTodayStats: vi.fn(),
    };
    summarizer = {
      summarize: vi.fn(),
    };
    embeddingService = {
      embed: vi.fn().mockResolvedValue([0.1, 0.2]),
    };
    service = new FilingsService(repository, summarizer, embeddingService);
    mockNsePoll.mockReset();
    mockBsePoll.mockReset();
    mockClassify.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runPollCycle polls concurrently and processes raw filings sequentially', async () => {
    const rawNSE = {
      exchange: 'NSE' as const,
      companyName: 'TCS',
      symbol: 'TCS',
      filingType: 'Corp',
      subject: 'Order Win A',
      pdfUrl: 'http://tcs.pdf',
      filedAt: new Date('2026-06-22T08:00:00Z'),
      rawPayload: {},
    };
    const rawBSE = {
      exchange: 'BSE' as const,
      companyName: 'Infosys',
      symbol: 'INFY',
      filingType: 'Corp',
      subject: 'Order Win B',
      pdfUrl: 'http://infy.pdf',
      filedAt: new Date('2026-06-22T08:00:00Z'),
      rawPayload: {},
    };

    mockNsePoll.mockResolvedValueOnce([rawNSE]);
    mockBsePoll.mockResolvedValueOnce([rawBSE]);

    mockClassify.mockReturnValue({ tier: 'ROUTINE', confidence: 'HIGH', matchedKeywords: [] });

    const counts = await service.runPollCycle();
    expect(counts).toEqual({ nse: 1, bse: 1 });
    expect(mockNsePoll).toHaveBeenCalledOnce();
    expect(mockBsePoll).toHaveBeenCalledOnce();
    expect(repository.existsByHash).toHaveBeenCalledTimes(2);
    expect(repository.insert).toHaveBeenCalledTimes(2);
  });

  it('processFiling skips already existing exact filings', async () => {
    const raw = {
      exchange: 'NSE' as const,
      companyName: 'TCS',
      symbol: 'TCS',
      filingType: 'Corp',
      subject: 'Order Win',
      pdfUrl: 'http://tcs.pdf',
      filedAt: new Date('2026-06-22T08:00:00Z'),
      rawPayload: {},
    };

    mockNsePoll.mockResolvedValueOnce([raw]);
    mockBsePoll.mockResolvedValueOnce([]);

    repository.existsByHash.mockResolvedValueOnce(true);

    await service.runPollCycle();

    expect(repository.existsByHash).toHaveBeenCalledOnce();
    expect(mockClassify).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it('processFiling classifies, embeds, checks semantic duplicate, and saves routine filings without summary', async () => {
    const raw = {
      exchange: 'NSE' as const,
      companyName: 'TCS',
      symbol: 'TCS',
      filingType: 'Corp',
      subject: 'Order Win',
      pdfUrl: 'http://tcs.pdf',
      filedAt: new Date('2026-06-22T08:00:00Z'),
      rawPayload: {},
    };

    mockNsePoll.mockResolvedValueOnce([raw]);
    mockBsePoll.mockResolvedValueOnce([]);

    mockClassify.mockReturnValueOnce({ tier: 'ROUTINE', confidence: 'HIGH', matchedKeywords: ['dividend'] });
    repository.insert.mockResolvedValueOnce('id_routine');

    await service.runPollCycle();

    expect(mockClassify).toHaveBeenCalledWith('Order Win', 'Corp');
    expect(embeddingService.embed).toHaveBeenCalledWith('Order Win');
    expect(repository.findSimilar).toHaveBeenCalledWith([0.1, 0.2], 'TCS', 0.92, 24);
    expect(repository.insert).toHaveBeenCalledWith(expect.objectContaining({
      tier: 'ROUTINE',
      isDuplicate: false,
    }));
    expect(repository.insertEmbedding).toHaveBeenCalledWith('id_routine', [0.1, 0.2]);
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('processFiling summarizes MATERIAL, non-duplicate filings and stores summaries', async () => {
    const raw = {
      exchange: 'NSE' as const,
      companyName: 'TCS',
      symbol: 'TCS',
      filingType: 'Corp',
      subject: 'Large Order Win',
      pdfUrl: 'http://tcs.pdf',
      filedAt: new Date('2026-06-22T08:00:00Z'),
      rawPayload: {},
    };

    mockNsePoll.mockResolvedValueOnce([raw]);
    mockBsePoll.mockResolvedValueOnce([]);

    mockClassify.mockReturnValueOnce({ tier: 'MATERIAL', confidence: 'HIGH', matchedKeywords: ['order'] });
    repository.insert.mockResolvedValueOnce('id_material');

    const mockSummary = {
      headline: 'TCS wins 1000Cr contract',
      category: 'OrderWin',
      materialityScore: 8,
      impactDirection: 'POSITIVE',
      keyEntities: ['TCS'],
      whyItMatters: 'Important win.',
      costUsd: 0.0015,
      tokensUsed: 120,
      modelUsed: 'claude-3-5-sonnet',
    };
    summarizer.summarize.mockResolvedValueOnce(mockSummary);

    await service.runPollCycle();

    expect(summarizer.summarize).toHaveBeenCalledWith('Large Order Win', 'http://tcs.pdf', 'NSE', 'TCS');
    expect(repository.insertSummary).toHaveBeenCalledWith('id_material', mockSummary);
  });

  it('processFiling marks filing as duplicate and skips summarization if semantic duplicate is found', async () => {
    const raw = {
      exchange: 'BSE' as const,
      companyName: 'TCS',
      symbol: 'TCS',
      filingType: 'Corp',
      subject: 'Large Order Win',
      pdfUrl: 'http://tcs.pdf',
      filedAt: new Date('2026-06-22T08:00:00Z'),
      rawPayload: {},
    };

    mockNsePoll.mockResolvedValueOnce([raw]);
    mockBsePoll.mockResolvedValueOnce([]);

    mockClassify.mockReturnValueOnce({ tier: 'MATERIAL', confidence: 'HIGH', matchedKeywords: ['order'] });
    repository.findSimilar.mockResolvedValueOnce([{ id: 'existing_nse_filing', similarity: 0.95 }]);
    repository.insert.mockResolvedValueOnce('id_duplicate_bse');

    await service.runPollCycle();

    expect(repository.insert).toHaveBeenCalledWith(expect.objectContaining({
      tier: 'MATERIAL',
      isDuplicate: true,
      duplicateOf: 'existing_nse_filing',
    }));
    expect(summarizer.summarize).not.toHaveBeenCalled();
  });

  it('starts and stops continuous polling interval', () => {
    vi.useFakeTimers();
    const runPollCycleSpy = vi.spyOn(service, 'runPollCycle').mockResolvedValue({ nse: 0, bse: 0 });

    service.startPolling(5000);
    expect(service.getPollingStatus().isPolling).toBe(true);
    expect(runPollCycleSpy).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(5000);
    expect(runPollCycleSpy).toHaveBeenCalledTimes(2);

    service.stopPolling();
    expect(service.getPollingStatus().isPolling).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(runPollCycleSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('delegates lookup methods to repository', async () => {
    repository.findRecent.mockResolvedValueOnce([]);
    repository.findMaterial.mockResolvedValueOnce([]);
    repository.findById.mockResolvedValueOnce(null);
    repository.getTodayStats.mockResolvedValueOnce({});

    await service.getRecentFilings(10);
    await service.getMaterialFilings(5);
    await service.getFilingById('123');
    await service.getTodayStats();

    expect(repository.findRecent).toHaveBeenCalledWith(10);
    expect(repository.findMaterial).toHaveBeenCalledWith(5);
    expect(repository.findById).toHaveBeenCalledWith('123');
    expect(repository.getTodayStats).toHaveBeenCalled();
  });
});
