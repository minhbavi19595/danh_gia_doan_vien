'use client';

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  disabled?: boolean;
  title?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Chọn...',
  className = '',
  size = 'sm',
  disabled = false,
  title,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => String(opt.value) === String(value));

  const computeStyle = (measuredWidth?: number, measuredHeight?: number): React.CSSProperties => {
    if (!triggerRef.current) return { position: 'fixed', zIndex: 99999 };
    const rect = triggerRef.current.getBoundingClientRect();
    const minW = Math.max(rect.width, 150);
    const maxW = Math.min(460, window.innerWidth - 16);
    const effectiveW = measuredWidth ? Math.min(measuredWidth, maxW) : minW;
    const effectiveH = measuredHeight || Math.min(280, options.length * 40 + 16);

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < effectiveH + 8 && rect.top > spaceBelow;
    const maxLeft = Math.max(8, window.innerWidth - effectiveW - 8);
    const left = Math.max(8, Math.min(rect.left, maxLeft));

    return {
      position: 'fixed',
      left,
      minWidth: minW,
      width: 'max-content',
      maxWidth: maxW,
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
      zIndex: 99999,
    };
  };

  const updatePosition = () => {
    const el = menuRef.current;
    const w = el ? el.getBoundingClientRect().width : undefined;
    const h = el ? el.getBoundingClientRect().height : undefined;
    setMenuStyle(computeStyle(w, h));
  };

  const handleToggle = () => {
    if (disabled) return;
    if (!open) {
      setMenuStyle(computeStyle());
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleScrollOrResize = () => updatePosition();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options.length]);

  const sizeClasses =
    size === 'xs'
      ? 'px-2.5 py-1 text-xs gap-1.5 rounded-lg'
      : size === 'md'
      ? 'px-3.5 py-2 text-sm gap-2 rounded-lg w-full'
      : 'px-3 py-1.5 text-xs sm:text-sm gap-2 rounded-lg';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={title || selectedOption?.label}
        onClick={handleToggle}
        className={`inline-flex items-center justify-between bg-slate-800/90 hover:bg-slate-800 border text-left font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? 'border-blue-500 ring-2 ring-blue-500/25 text-white'
            : 'border-slate-700 hover:border-slate-500 text-slate-100'
        } ${sizeClasses} ${className}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <ChevronDown
          size={size === 'xs' ? 14 : 15}
          className={`shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-blue-400' : 'text-slate-400'
          }`}
        />
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={menuStyle}
            className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-xl shadow-2xl shadow-black/60 p-1.5 max-h-64 overflow-y-auto"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-500 text-center">Không có dữ liệu</div>
            ) : (
              options.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(String(opt.value));
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm text-left transition-colors ${
                      opt.disabled
                        ? 'text-slate-500 cursor-not-allowed'
                        : isSelected
                        ? 'bg-blue-500/20 text-blue-300 font-semibold'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white cursor-pointer'
                    }`}
                  >
                    <span className="whitespace-normal break-words leading-snug">{opt.label}</span>
                    {isSelected && <Check size={14} className="text-blue-400 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </>
  );
}

