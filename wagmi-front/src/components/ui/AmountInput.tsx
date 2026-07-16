import { type ReactNode } from "react";

type AmountInputProps = {
  value: string;
  onChange: (value: string) => void;
  onMax?: () => void;
  placeholder?: string;
  disabled?: boolean;
  suffix?: ReactNode;
};

export function AmountInput({
  value,
  onChange,
  onMax,
  placeholder = "0.0",
  disabled,
  suffix,
}: AmountInputProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "" || /^\d*\.?\d*$/.test(v)) {
            onChange(v);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-transparent text-right font-mono text-lg outline-none disabled:cursor-not-allowed"
      />
      {suffix && <span className="shrink-0 text-sm text-gray-500">{suffix}</span>}
      {onMax && (
        <button
          type="button"
          onClick={onMax}
          disabled={disabled}
          className="shrink-0 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Max
        </button>
      )}
    </div>
  );
}
