import { render, screen, fireEvent, act } from '@testing-library/react';
import { GoogleSignInButton } from '../GoogleSignInButton';
import { createBrowserClient } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock client and toast hooks to avoid invoking real APIs during testing
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

describe('GoogleSignInButton', () => {
  let mockSignInWithOAuth = vi.fn();
  let mockSupabase: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    mockSupabase = {
      auth: {
        signInWithOAuth: mockSignInWithOAuth,
      },
    };
    (createBrowserClient as any).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Google sign-in button with default state', () => {
    render(<GoogleSignInButton />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('prevents double-clicks and enters loading state', async () => {
    let resolvePromise: any;
    const slowPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockSignInWithOAuth.mockReturnValue(slowPromise);

    render(<GoogleSignInButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });

    fireEvent.click(button);

    // Button should be disabled and show loading spinner immediately
    expect(button).toBeDisabled();
    expect(screen.getByTestId('spinner')).toBeInTheDocument();

    // Clicking again should not trigger another sign-in request
    fireEvent.click(button);
    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);

    // Resolve the original authorization promise
    await act(async () => {
      resolvePromise({ error: null });
    });
  });

  it('displays error toast when signInWithOAuth returns an error object', async () => {
    mockSignInWithOAuth.mockResolvedValue({
      error: { message: 'OAuth redirect failed' },
    });

    render(<GoogleSignInButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Authentication Error',
        description: 'OAuth redirect failed',
        variant: 'destructive',
      }),
    );
    expect(button).not.toBeDisabled();
  });

  it('handles network timeouts gracefully if the redirection hangs', async () => {
    mockSignInWithOAuth.mockReturnValue(new Promise(() => {}));

    render(<GoogleSignInButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });

    fireEvent.click(button);
    expect(button).toBeDisabled();

    // Advance virtual timers past the 8-second limit
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sign-In Timeout',
        variant: 'destructive',
      }),
    );
    expect(button).not.toBeDisabled();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('catches promise rejections/exceptions and displays connection error toast', async () => {
    mockSignInWithOAuth.mockRejectedValue(new Error('Network disconnected'));

    render(<GoogleSignInButton />);
    const button = screen.getByRole('button', { name: /sign in with google/i });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Connection Error',
        description: 'Network disconnected',
        variant: 'destructive',
      }),
    );
    expect(button).not.toBeDisabled();
  });
});
