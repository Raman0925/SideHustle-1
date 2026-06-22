import { RawFiling } from './filings.types.js';

// ─── NSE Poller ───────────────────────────────────────────────────────────────
// Polls NSE corporate announcements JSON endpoint every 90s.
// NSE returns announcements at this undocumented but stable endpoint.
// We discovered this by inspecting network requests on nseindia.com/companies-info/corporate-filings-announcements

const NSE_BASE_URL = 'https://www.nseindia.com';
const NSE_ANNOUNCEMENTS_URL = `${NSE_BASE_URL}/api/corp-info?index=equities&category=corporate_announcements&symbol=`;
const NSE_ALL_ANNOUNCEMENTS_URL = `${NSE_BASE_URL}/api/home/announcements`;

// NSE blocks requests without proper browser headers — these are required
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.nseindia.com/companies-info/corporate-filings-announcements',
  'Connection': 'keep-alive',
  'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};

export interface NSEPoller {
  poll(): Promise<RawFiling[]>;
  cookieJar: string;
  lastSeenIds: Set<string>;
}

export function createNSEPoller(): NSEPoller {
  const lastSeenIds = new Set<string>();
  let cookieJar: string = '';

  // NSE requires a session cookie obtained by hitting the homepage first.
  // Without this, all API calls return 401.
  async function refreshCookie(): Promise<void> {
    try {
      const resp = await fetch(NSE_BASE_URL, {
        headers: NSE_HEADERS,
        signal: AbortSignal.timeout(10_000),
      });
      const setCookie = resp.headers.get('set-cookie');
      if (setCookie) {
        // Extract just the cookie values (not directives like Path, HttpOnly etc.)
        cookieJar = setCookie
          .split(',')
          .map(c => c.split(';')[0].trim())
          .join('; ');
      }
    } catch (err) {
      console.error('[NSEPoller] Failed to refresh cookie:', err);
    }
  }

  async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await fetch(url, {
          headers: {
            ...NSE_HEADERS,
            ...(cookieJar ? { Cookie: cookieJar } : {}),
          },
          signal: AbortSignal.timeout(15_000),
        });

        // NSE returns 401 when cookie expires — refresh and retry
        if (resp.status === 401) {
          await refreshCookie();
          continue;
        }

        if (!resp.ok) {
          throw new Error(`NSE API returned ${resp.status}: ${resp.statusText}`);
        }

        return resp;
      } catch (err: any) {
        lastError = err;
        // Exponential backoff: 1s, 2s, 4s
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    throw lastError ?? new Error('NSE fetch failed after retries');
  }

  async function poll(): Promise<RawFiling[]> {
    // First poll — get cookie
    if (!cookieJar) {
      await refreshCookie();
    }

    let data: any;
    try {
      const resp = await fetchWithRetry(NSE_ALL_ANNOUNCEMENTS_URL);
      data = await resp.json();
    } catch (err) {
      console.error('[NSEPoller] Poll failed:', err);
      return [];
    }

    // NSE response shape: { data: [ { symbol, subject, bflag, exchdisstime, attchmntFile, ... } ] }
    const announcements: any[] = data?.data ?? [];
    const newFilings: RawFiling[] = [];

    for (const item of announcements) {
      // Deduplicate by a stable key: symbol + subject + exchange date
      const id = `NSE-${item.symbol}-${item.exchdisstime}-${item.subject?.slice(0, 50)}`;

      if (lastSeenIds.has(id)) continue;
      lastSeenIds.add(id);

      // Keep in-memory set bounded — remove oldest entries beyond 5000
      if (lastSeenIds.size > 5000) {
        const [first] = lastSeenIds;
        lastSeenIds.delete(first);
      }

      newFilings.push({
        exchange: 'NSE',
        companyName: item.corp_name ?? item.symbol ?? 'Unknown',
        symbol: item.symbol ?? '',
        isin: item.isin ?? undefined,
        filingType: item.bflag ?? 'Announcement',
        subject: item.subject ?? '',
        pdfUrl: item.attchmntFile
          ? `${NSE_BASE_URL}${item.attchmntFile}`
          : '',
        filedAt: item.exchdisstime
          ? new Date(item.exchdisstime)
          : new Date(),
        rawPayload: item,
      });
    }

    return newFilings;
  }

  return {
    poll,
    get cookieJar() { return cookieJar; },
    set cookieJar(val) { cookieJar = val; },
    get lastSeenIds() { return lastSeenIds; }
  };
}

// ─── BSE Poller ───────────────────────────────────────────────────────────────
// BSE is more API-friendly than NSE.
// Corporate announcements are at a documented endpoint with pagination.

const BSE_ANNOUNCEMENTS_URL =
  'https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?' +
  'strCat=-1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C&subcategory=-1';

const BSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.bseindia.com',
  'Referer': 'https://www.bseindia.com/',
};

export interface BSEPoller {
  poll(): Promise<RawFiling[]>;
}

export function createBSEPoller(): BSEPoller {
  const lastSeenIds = new Set<string>();

  async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await fetch(url, {
          headers: BSE_HEADERS,
          signal: AbortSignal.timeout(15_000),
        });

        if (!resp.ok) {
          throw new Error(`BSE API returned ${resp.status}: ${resp.statusText}`);
        }

        return resp;
      } catch (err: any) {
        lastError = err;
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    throw lastError ?? new Error('BSE fetch failed after retries');
  }

  async function poll(): Promise<RawFiling[]> {
    let data: any;
    try {
      const resp = await fetchWithRetry(BSE_ANNOUNCEMENTS_URL);
      data = await resp.json();
    } catch (err) {
      console.error('[BSEPoller] Poll failed:', err);
      return [];
    }

    // BSE response shape: { Table: [ { SCRIP_CD, SLONGNAME, HEADLINE, DT_TM, ATTACHMENTNAME, ... } ] }
    const announcements: any[] = data?.Table ?? [];
    const newFilings: RawFiling[] = [];

    for (const item of announcements) {
      const id = `BSE-${item.SCRIP_CD}-${item.DT_TM}-${item.HEADLINE?.slice(0, 50)}`;

      if (lastSeenIds.has(id)) continue;
      lastSeenIds.add(id);

      if (lastSeenIds.size > 5000) {
        const [first] = lastSeenIds;
        lastSeenIds.delete(first);
      }

      newFilings.push({
        exchange: 'BSE',
        companyName: item.SLONGNAME ?? item.SCRIP_CD ?? 'Unknown',
        symbol: item.SCRIP_CD?.toString() ?? '',
        isin: item.ISIN_CODE ?? undefined,
        filingType: item.CATEGORYNAME ?? 'Announcement',
        subject: item.HEADLINE ?? '',
        pdfUrl: item.ATTACHMENTNAME
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${item.ATTACHMENTNAME}`
          : '',
        filedAt: item.DT_TM ? new Date(item.DT_TM) : new Date(),
        rawPayload: item,
      });
    }

    return newFilings;
  }

  return { poll };
}
