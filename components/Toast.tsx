'use client';

import { useToast } from '@/contexts/ToastContext';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const colorMap = {
  success: {
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
    icon: 'text-emerald-500',
  },
  error: {
    bg: 'bg-red-500/15',
    border: 'border-red-500/30',
    text: 'text-red-400',
    icon: 'text-red-500',
  },
  info: {
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    icon: 'text-blue-500',
  },
};

export default function ToastContainer() {
  const { toasts, remove } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const Icon = iconMap[toast.type];
        const colors = colorMap[toast.type];
        
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl toast-slide-in ${colors.bg} ${colors.border}`}
          >
            <Icon size={20} className={`${colors.icon} shrink-0 mt-0.5`} />
            <p className={`text-sm font-medium flex-1 ${colors.text}`}>{toast.message}</p>
            <button
              onClick={() => remove(toast.id)}
              className="text-slate-500 hover:text-white transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
