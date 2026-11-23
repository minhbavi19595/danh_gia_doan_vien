'use client';

import { useToast } from '@/contexts/ToastContext';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const iconMap = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  confirm: AlertTriangle,
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
  confirm: {
    bg: 'bg-slate-900/95',
    border: 'border-amber-500/40',
    text: 'text-slate-100',
    icon: 'text-amber-400',
  },
};

export default function ToastContainer() {
  const { toasts, remove } = useToast();

  if (toasts.length === 0) return null;

  const normalToasts = toasts.filter(t => t.type !== 'confirm');
  const confirmToasts = toasts.filter(t => t.type === 'confirm');

  return (
    <>
      {normalToasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
          {normalToasts.map(toast => {
            const Icon = iconMap[toast.type];
            const colors = colorMap[toast.type];

            return (
              <div
                key={toast.id}
                className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-xl shadow-2xl toast-slide-in ${colors.bg} ${colors.border}`}
              >
                <Icon size={20} className={`${colors.icon} shrink-0 mt-0.5`} />
                <p className={`text-sm font-medium flex-1 whitespace-pre-line ${colors.text}`}>{toast.message}</p>
                <button
                  onClick={() => remove(toast.id, false)}
                  className="text-slate-500 hover:text-white transition-colors shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {confirmToasts.map(toast => (
        <div
          key={toast.id}
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="glass-panel w-full max-w-md p-6 border border-slate-700/80 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} className="text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white mb-1.5">Xác nhận thao tác</h3>
                <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed">
                  {toast.message}
                </p>
              </div>
              <button
                onClick={() => remove(toast.id, false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => remove(toast.id, false)}
                className="btn btn-secondary py-2 px-4 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={() => remove(toast.id, true)}
                className="btn bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold py-2 px-4 text-sm"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
