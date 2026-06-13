import * as React from 'react';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

type Listener = (toasts: Toast[]) => void;
let listeners: Listener[] = [];
let toasts: Toast[] = [];

function notifyListeners() {
  listeners.forEach((listener) => listener(toasts));
}

/**
 * Programmatically triggers a toast notification.
 */
export function toast({ title, description, variant = 'default' }: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).substring(2, 9);
  const newToast: Toast = { id, title, description, variant };
  toasts = [...toasts, newToast];
  notifyListeners();

  // Auto-remove the toast after 5 seconds
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 5000);

  return {
    id,
    dismiss: () => {
      toasts = toasts.filter((t) => t.id !== id);
      notifyListeners();
    },
  };
}

/**
 * React hook to hook into the global toast state.
 */
export function useToast() {
  const [state, setState] = React.useState<Toast[]>(toasts);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((listener) => listener !== setState);
    };
  }, []);

  return {
    toasts: state,
    toast,
    dismiss: (id: string) => {
      toasts = toasts.filter((t) => t.id !== id);
      notifyListeners();
    },
  };
}
