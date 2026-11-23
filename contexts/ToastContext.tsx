'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'confirm';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  onResolve?: (confirmed: boolean) => void;
}

interface ToastContextType {
  toasts: ToastItem[];
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  confirm: (message: string) => Promise<boolean>;
  remove: (id: string, confirmed?: boolean) => void;
}

const ToastContext = createContext<ToastContextType>({} as ToastContextType);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const remove = useCallback((id: string, confirmed = false) => {
    setToasts(prev => {
      const target = prev.find(t => t.id === id);
      if (target?.onResolve) {
        target.onResolve(confirmed);
      }
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2);
      setToasts(prev => [
        ...prev,
        {
          id,
          message,
          type: 'confirm',
          onResolve: resolve,
        },
      ]);
    });
  }, []);

  const success = useCallback((message: string) => addToast(message, 'success'), [addToast]);
  const error = useCallback((message: string) => addToast(message, 'error'), [addToast]);
  const info = useCallback((message: string) => addToast(message, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, success, error, info, confirm, remove }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
