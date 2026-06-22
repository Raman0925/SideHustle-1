import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NSEPoller, BSEPoller, createNSEPoller, createBSEPoller } from '../filings.poller.js';

describe('NSEPoller', () => {
  let poller: NSEPoller;
  let mockFetch: any;

  beforeEach(() => {
    poller = createNSEPoller();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('setTimeout', (fn: any) => {
      fn();
      return {} as any;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('performs cookie handshake on first poll and fetches announcements', async () => {
    const mockHeaders = new Headers();
    mockHeaders.set('set-cookie', 'nsit=12345; Path=/, other=abc; Domain=nse.com');

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: mockHeaders,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              symbol: 'TCS',
              corp_name: 'Tata Consultancy Services',
              bflag: 'Dividend',
              subject: 'Interim Dividend',
              attchmntFile: '/path/to/pdf',
              exchdisstime: '2026-06-22T08:00:00.000Z',
              isin: 'INE467B01029',
            },
          ],
        }),
      });

    const filings = await poller.poll();
    expect(filings.length).toBe(1);
    expect(filings[0]).toEqual({
      exchange: 'NSE',
      companyName: 'Tata Consultancy Services',
      symbol: 'TCS',
      isin: 'INE467B01029',
      filingType: 'Dividend',
      subject: 'Interim Dividend',
      pdfUrl: 'https://www.nseindia.com/path/to/pdf',
      filedAt: new Date('2026-06-22T08:00:00.000Z'),
      rawPayload: expect.any(Object),
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('refreshes cookies if request returns 401 and succeeds on retry', async () => {
    const mockHeaders = new Headers();
    mockHeaders.set('set-cookie', 'nsit=newcookie;');

    poller['cookieJar'] = 'nsit=oldcookie';

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: mockHeaders,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              symbol: 'INFY',
              corp_name: 'Infosys',
              bflag: 'Acquisition',
              subject: 'Acquisition update',
              attchmntFile: '/path.pdf',
              exchdisstime: '2026-06-22T08:00:00.000Z',
            },
          ],
        }),
      });

    const filings = await poller.poll();
    expect(filings.length).toBe(1);
    expect(poller['cookieJar']).toBe('nsit=newcookie');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('handles empty results and network failures gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const filings = await poller.poll();
    expect(filings).toEqual([]);
  });

  it('deduplicates announcements and caps memory size of seen ids', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { symbol: 'TCS', subject: 'Subject A', exchdisstime: '2026-06-22T08:00:00.000Z' },
          { symbol: 'TCS', subject: 'Subject A', exchdisstime: '2026-06-22T08:00:00.000Z' },
        ],
      }),
    });

    poller['cookieJar'] = 'cookie';
    const filings = await poller.poll();
    expect(filings.length).toBe(1);

    poller['lastSeenIds'].clear();
    for (let i = 0; i < 5000; i++) {
      poller['lastSeenIds'].add(`NSE-DUMMY-${i}`);
    }
    expect(poller['lastSeenIds'].size).toBe(5000);

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ symbol: 'TCS', subject: 'Subject New', exchdisstime: '2026-06-22T09:00:00.000Z' }],
      }),
    });
    await poller.poll();
    expect(poller['lastSeenIds'].size).toBe(5000);
  });
});

describe('BSEPoller', () => {
  let poller: BSEPoller;
  let mockFetch: any;

  beforeEach(() => {
    poller = createBSEPoller();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('setTimeout', (fn: any) => {
      fn();
      return {} as any;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('polls announcements correctly', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Table: [
          {
            SCRIP_CD: 500180,
            SLONGNAME: 'HDFC Bank Ltd.',
            ISIN_CODE: 'INE040A01034',
            CATEGORYNAME: 'Board Meeting',
            HEADLINE: 'Outcome of Board Meeting',
            ATTACHMENTNAME: 'hdfc_attach.pdf',
            DT_TM: '2026-06-22T08:00:00.000Z',
          },
        ],
      }),
    });

    const filings = await poller.poll();
    expect(filings.length).toBe(1);
    expect(filings[0]).toEqual({
      exchange: 'BSE',
      companyName: 'HDFC Bank Ltd.',
      symbol: '500180',
      isin: 'INE040A01034',
      filingType: 'Board Meeting',
      subject: 'Outcome of Board Meeting',
      pdfUrl: 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/hdfc_attach.pdf',
      filedAt: new Date('2026-06-22T08:00:00.000Z'),
      rawPayload: expect.any(Object),
    });
  });

  it('returns empty array when BSE poll fails', async () => {
    mockFetch.mockRejectedValue(new Error('BSE offline'));
    const filings = await poller.poll();
    expect(filings).toEqual([]);
  });
});
