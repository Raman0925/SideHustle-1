import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilingsRepository, createFilingsRepository } from '../filings.repository.js';
import postgres from 'postgres';

describe('FilingsRepository', () => {
  let mockDb: any;
  let repository: FilingsRepository;

  beforeEach(() => {
    mockDb = vi.fn() as unknown as postgres.Sql;
    repository = createFilingsRepository(mockDb);
  });

  it('existsByHash returns true if count > 0', async () => {
    mockDb.mockResolvedValue([{ count: '1' }]);
    const result = await repository.existsByHash('abc');
    expect(result).toBe(true);
    expect(mockDb).toHaveBeenCalledOnce();
  });

  it('existsByHash returns false if count is 0', async () => {
    mockDb.mockResolvedValue([{ count: '0' }]);
    const result = await repository.existsByHash('abc');
    expect(result).toBe(false);
  });

  it('insert saves filing and returns the ID', async () => {
    mockDb.mockResolvedValue([{ id: 'new_id' }]);
    const params = {
      exchange: 'NSE',
      symbol: 'TCS',
      companyName: 'Tata Consultancy Services',
      filingType: 'Corp Announcement',
      subject: 'Order Win',
      filedAt: new Date('2026-06-22T08:00:00Z'),
      tier: 'MATERIAL',
      pdfUrl: 'http://example.com/pdf',
      isDuplicate: false,
      duplicateOf: undefined,
      contentHash: 'hash123',
      rawPayload: { key: 'value' },
    };
    const id = await repository.insert(params);
    expect(id).toBe('new_id');
    expect(mockDb).toHaveBeenCalledOnce();
  });

  it('insert throws error if query returns no result', async () => {
    mockDb.mockResolvedValue([]);
    const params = {
      exchange: 'NSE',
      symbol: 'TCS',
      companyName: 'TCS',
      filingType: 'Corp',
      subject: 'Win',
      filedAt: new Date(),
      tier: 'MATERIAL',
      pdfUrl: 'http://example.com',
      isDuplicate: false,
      contentHash: 'hash',
      rawPayload: {},
    };
    await expect(repository.insert(params)).rejects.toThrow('Failed to insert filing');
  });

  it('insertSummary queries database without returning output', async () => {
    mockDb.mockResolvedValue([]);
    const summary = {
      headline: 'Headline',
      category: 'OrderWin' as const,
      materialityScore: 8,
      impactDirection: 'POSITIVE' as const,
      keyEntities: ['TCS'],
      whyItMatters: 'Retail investors should care.',
      estimatedDealSize: '100 Cr',
      tokensUsed: 120,
      modelUsed: 'claude-3-5-sonnet',
      costUsd: 0.0015,
    };
    await repository.insertSummary('id123', summary);
    expect(mockDb).toHaveBeenCalledOnce();
  });

  it('insertEmbedding stores vectors correctly', async () => {
    mockDb.mockResolvedValue([]);
    await repository.insertEmbedding('id123', [0.1, 0.2]);
    expect(mockDb).toHaveBeenCalledOnce();
  });

  it('findSimilar executes query successfully', async () => {
    mockDb.mockResolvedValue([{ id: 'id123', similarity: 0.95 }]);
    const result = await repository.findSimilar([0.1, 0.2], 'TCS', 0.92, 24);
    expect(mockDb).toHaveBeenCalledOnce();
    expect(result).toEqual([{ id: 'id123', similarity: 0.95 }]);
  });

  it('findRecent retrieves recent filings and maps them', async () => {
    mockDb.mockResolvedValue([
      {
        id: 'id1',
        exchange: 'NSE',
        symbol: 'TCS',
        company_name: 'TCS Ltd',
        filing_type: 'Corp',
        subject: 'Subject',
        filed_at: '2026-06-22T08:00:00Z',
        tier: 'MATERIAL',
        pdf_url: 'http://example.com',
        is_duplicate: false,
        duplicate_of: null,
        created_at: '2026-06-22T08:05:00Z',
        headline: 'Headline',
        category: 'OrderWin',
        materiality_score: 8,
        impact_direction: 'POSITIVE',
        key_entities: ['TCS'],
        why_it_matters: 'Why it matters',
        estimated_deal_size: '100 Cr',
        tokens_used: 100,
        model_used: 'model',
        cost_usd: '0.001',
      },
    ]);
    const recent = await repository.findRecent(10);
    expect(recent.length).toBe(1);
    expect(recent[0].id).toBe('id1');
    expect(recent[0].summary).toBeDefined();
    expect(recent[0].summary?.headline).toBe('Headline');
    expect(recent[0].summary?.costUsd).toBe(0.001);
  });

  it('findMaterial retrieves material filings only', async () => {
    mockDb.mockResolvedValue([]);
    const material = await repository.findMaterial(5);
    expect(material.length).toBe(0);
  });

  it('findById retrieves specific filing or returns null', async () => {
    mockDb.mockResolvedValue([]);
    const result = await repository.findById('non_existent');
    expect(result).toBeNull();
  });

  it('getTodayStats retrieves aggregated statistics', async () => {
    mockDb.mockResolvedValue([
      {
        total_filings: '5',
        material_count: '2',
        watch_count: '1',
        routine_count: '2',
        duplicate_count: '3',
        total_cost_usd: '0.005',
      },
    ]);
    const stats = await repository.getTodayStats();
    expect(stats).toEqual({
      totalFilings: 5,
      materialCount: 2,
      watchCount: 1,
      routineCount: 2,
      duplicateCount: 3,
      totalCostUsd: 0.005,
    });
  });
});
