'use client';

import * as React from 'react';
import { useToast } from '@/hooks/use-toast';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toaster component to render active notifications.
 * Include this at the root layout of your application.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map(({ id, title, description, variant }) => {
        const isDestructive = variant === 'destructive';
        return (
          <div
            key={id}
            className={cn(
              'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-4 pr-8 shadow-lg transition-all duration-300',
              isDestructive
                ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-50'
                : 'border-zinc-200 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50',
            )}
            style={{
              animation: 'slideIn 0.2s ease-out forwards',
            }}
          >
            <div className="grid gap-1">
              {title && <div className="text-sm font-semibold">{title}</div>}
              {description && (
                <div
                  className={cn(
                    'text-xs opacity-90',
                    isDestructive
                      ? 'text-red-700 dark:text-red-200'
                      : 'text-zinc-500 dark:text-zinc-400',
                  )}
                >
                  {description}
                </div>
              )}
            </div>
            <button
              onClick={() => dismiss(id)}
              className={cn(
                'absolute right-2 top-2 rounded-md p-1 opacity-50 transition-opacity hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                isDestructive
                  ? 'text-red-900/50 hover:text-red-900'
                  : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50',
              )}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateY(1rem);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
