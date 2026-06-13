'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

/**
 * GoogleSignInButton Component
 * Renders a Google Sign-In button adhering to brand guidelines,
 * with security mitigations for timeout, double-clicks, and error handling.
 */
export function GoogleSignInButton() {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleGoogleSignIn = async () => {
    if (isLoading) return; // Prevent double-clicks / concurrent execution
    setIsLoading(true);

    const supabase = createBrowserClient();

    // Setup an 8-second timeout handler for network issues/redirection freezes
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
      toast({
        title: 'Sign-In Timeout',
        description: 'Connection timed out while initializing OAuth. Please try again.',
        variant: 'destructive',
      });
    }, 8000);

    try {
      // Supabase OAuth PKCE flow automatically sets code verifiers in browser storage
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        clearTimeout(timeoutId);
        setIsLoading(false);
        toast({
          title: 'Authentication Error',
          description: error.message || 'Failed to initialize Google Sign-In.',
          variant: 'destructive',
        });
        return;
      }
    } catch (err: any) {
      // Gracefully catch potential errors (e.g. browser context issues) to prevent unhandled promise rejections
      clearTimeout(timeoutId);
      setIsLoading(false);
      toast({
        title: 'Connection Error',
        description: err.message || 'A network error occurred. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      variant="outline"
      className="w-full flex items-center justify-center gap-2 border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" data-testid="spinner" />
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.273 0 3.19 2.736 1.182 6.727l4.084 3.038z"
          />
          <path
            fill="#34A853"
            d="M16.04 15.345c-1.072.727-2.436 1.164-4.04 1.164-2.927 0-5.418-1.982-6.309-4.654L1.609 14.9C3.618 18.89 7.7 21.636 12 21.636c3.136 0 6.09-1.045 8.245-3l-4.205-3.291z"
          />
          <path
            fill="#4285F4"
            d="M23.49 12.273c0-.818-.082-1.609-.209-2.382H12v4.518h6.464c-.29 1.5-.1.973-1.09 2.227l4.205 3.291c2.464-2.273 3.91-5.618 3.91-9.654z"
          />
          <path
            fill="#FBBC05"
            d="M5.69 11.855c-.236-.727-.373-1.5-.373-2.31 0-.81.137-1.582.373-2.31L1.609 4.19A11.968 11.968 0 0 0 0 9.545c0 1.936.464 3.764 1.29 5.4l4.4-3.09z"
          />
        </svg>
      )}
      <span>Sign in with Google</span>
    </Button>
  );
}
