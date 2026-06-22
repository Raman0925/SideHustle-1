import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import filingsController from '../filings.controller.js';
import {
  getRecentFilings,
  getMaterialFilings,
  getFilingById,
  getTodayStats,
  runPollCycle,
} from '../filings.service.js';

vi.mock('../filings.service.js', () => {
  return {
    getRecentFilings: vi.fn(),
    getMaterialFilings: vi.fn(),
    getFilingById: vi.fn(),
    getTodayStats: vi.fn(),
    runPollCycle: vi.fn(),
    filingsService: {
      getPollingStatus: vi.fn().mockReturnValue({ isPolling: true }),
    },
  };
});

describe('FilingsController', () => {
  let app: any;

  beforeEach(async () => {
    app = Fastify();
    app.register(filingsController);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  it('GET /recent returns recent filings', async () => {
    const mockFilings = [{ id: '1', symbol: 'TCS' }];
    vi.mocked(getRecentFilings).mockResolvedValueOnce(mockFilings as any);

    const response = await app.inject({
      method: 'GET',
      url: '/recent',
      query: { limit: '10' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual({ filings: mockFilings, count: 1 });
    expect(getRecentFilings).toHaveBeenCalledWith(10);
  });

  it('GET /material returns material filings', async () => {
    const mockFilings = [{ id: '2', symbol: 'INFY', tier: 'MATERIAL' }];
    vi.mocked(getMaterialFilings).mockResolvedValueOnce(mockFilings as any);

    const response = await app.inject({
      method: 'GET',
      url: '/material',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual({ filings: mockFilings, count: 1 });
    expect(getMaterialFilings).toHaveBeenCalledWith(20);
  });

  it('GET /:id returns specific filing if found', async () => {
    const mockFiling = { id: 'abc', symbol: 'TCS' };
    vi.mocked(getFilingById).mockResolvedValueOnce(mockFiling as any);

    const response = await app.inject({
      method: 'GET',
      url: '/abc',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual(mockFiling);
    expect(getFilingById).toHaveBeenCalledWith('abc');
  });

  it('GET /:id returns 404 if filing is not found', async () => {
    vi.mocked(getFilingById).mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'GET',
      url: '/not_found',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body).toEqual({ error: 'Filing not found' });
  });

  it('GET /stats/today returns statistics', async () => {
    const mockStats = { totalFilings: 5, materialCount: 2 };
    vi.mocked(getTodayStats).mockResolvedValueOnce(mockStats as any);

    const response = await app.inject({
      method: 'GET',
      url: '/stats/today',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual(mockStats);
  });

  it('GET /health returns poller status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.isPolling).toBe(true);
    expect(body.timestamp).toBeDefined();
  });

  it('POST /poll triggers poll cycle manually', async () => {
    const mockResult = { nse: 2, bse: 1 };
    vi.mocked(runPollCycle).mockResolvedValueOnce(mockResult);

    const response = await app.inject({
      method: 'POST',
      url: '/poll',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual({
      message: 'Poll cycle complete',
      newFilings: mockResult,
    });
    expect(runPollCycle).toHaveBeenCalledOnce();
  });
});
