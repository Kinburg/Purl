import { useState, useCallback, useEffect, useRef } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  float?: boolean;
  placeholder?: string;
  className?: string;
  onFocus?: () => void;
  disabled?: boolean;
}

export default function NumericInput({
  value, onChange, min, max, step, float, placeholder, className, onFocus, disabled,
}: NumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft === null && ref.current && document.activeElement !== ref.current) {
      // sync external value when not editing
    }
  }, [value, draft]);

  const clamp = useCallback((n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  }, [min, max]);

  const commit = useCallback((raw: string) => {
    const parsed = float ? parseFloat(raw) : parseInt(raw, 10);
    if (isNaN(parsed)) {
      setDraft(null);
      return;
    }
    const clamped = clamp(parsed);
    onChange(clamped);
    setDraft(null);
  }, [float, clamp, onChange]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  const handleBlur = () => {
    if (draft !== null) commit(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (draft !== null) commit(draft);
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === 'Escape') {
      setDraft(null);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleFocus = () => {
    setDraft(String(value));
    onFocus?.();
  };

  return (
    <input
      ref={ref}
      type="number"
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      className={className}
      value={draft !== null ? draft : value}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}
