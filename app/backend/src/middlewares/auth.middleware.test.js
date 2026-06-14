import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import authMiddleware from './auth.middleware.js';
import jwt from 'jsonwebtoken';

describe('authMiddleware', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('should bypass auth for /health, /docs, and /favicon.ico', async () => {
    const reply = {};

    // Test health
    const reqHealth = { url: '/health' };
    await expect(authMiddleware(reqHealth, reply)).resolves.toBeUndefined();

    // Test docs
    const reqDocs = { url: '/docs/index.html' };
    await expect(authMiddleware(reqDocs, reply)).resolves.toBeUndefined();

    // Test favicon
    const reqFavicon = { url: '/favicon.ico' };
    await expect(authMiddleware(reqFavicon, reply)).resolves.toBeUndefined();
  });

  it('should throw 401 if Authorization header is missing', async () => {
    const req = {
      url: '/auth/me',
      headers: {},
    };
    const reply = {};

    await expect(authMiddleware(req, reply)).rejects.toThrow(
      'Unauthorized: Missing or invalid token format',
    );
  });

  it('should throw 401 if Authorization header is not Bearer', async () => {
    const req = {
      url: '/auth/me',
      headers: {
        authorization: 'Basic abc',
      },
    };
    const reply = {};

    await expect(authMiddleware(req, reply)).rejects.toThrow(
      'Unauthorized: Missing or invalid token format',
    );
  });

  it('should throw 401 if token verification fails', async () => {
    const req = {
      url: '/auth/me',
      headers: {
        authorization: 'Bearer invalid-token-sig',
      },
    };
    const reply = {};

    await expect(authMiddleware(req, reply)).rejects.toThrow(
      'Unauthorized: Invalid or expired access token',
    );
  });

  it('should verify token, query database and attach profile to request.user if profile exists', async () => {
    const payload = {
      sub: 'user-id-123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'John Doe',
        avatar_url: 'https://example.com/avatar.png',
      },
    };
    const token = jwt.sign(payload, 'test-jwt-secret');

    const mockProfile = {
      id: 'user-id-123',
      email: 'test@example.com',
      full_name: 'John Doe',
      avatar_url: 'https://example.com/avatar.png',
      updated_at: '2026-06-14T08:00:00Z',
    };

    const mockQuery = vi.fn().mockResolvedValue({
      rows: [mockProfile],
    });

    const req = {
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
      server: {
        pg: {
          query: mockQuery,
        },
      },
      log: {
        warn: vi.fn(),
      },
    };
    const reply = {};

    await authMiddleware(req, reply);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT id, email, full_name, avatar_url, updated_at FROM public.profiles WHERE id = $1',
      ['user-id-123'],
    );
    expect(req.user).toEqual(mockProfile);
  });

  it('should use fallback metadata when profile is not found in database', async () => {
    const payload = {
      sub: 'user-id-456',
      email: 'fallback@example.com',
      user_metadata: {
        full_name: 'Fallback User',
        avatar_url: null,
      },
    };
    const token = jwt.sign(payload, 'test-jwt-secret');

    const mockQuery = vi.fn().mockResolvedValue({
      rows: [], // empty rows -> profile not found
    });

    const mockWarn = vi.fn();
    const req = {
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
      server: {
        pg: {
          query: mockQuery,
        },
      },
      log: {
        warn: mockWarn,
      },
    };
    const reply = {};

    await authMiddleware(req, reply);

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT id, email, full_name, avatar_url, updated_at FROM public.profiles WHERE id = $1',
      ['user-id-456'],
    );
    expect(req.user.id).toBe('user-id-456');
    expect(req.user.email).toBe('fallback@example.com');
    expect(req.user.full_name).toBe('Fallback User');
    expect(req.user.avatar_url).toBeNull();
    expect(req.user.updated_at).toBeDefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});
