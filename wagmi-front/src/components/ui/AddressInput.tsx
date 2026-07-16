import { type ChangeEvent } from "react";

type AddressInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
};

export function AddressInput({
  value,
  onChange,
  placeholder = "0x...",
  disabled,
  invalid,
}: AddressInputProps) {
  const classes = [
    "w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm outline-none",
    "focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
    invalid
      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
      : "border-gray-300 focus:border-indigo-500 focus:ring-indigo-500",
  ].join(" ");

  return (
    <input
      type="text"
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      spellCheck={false}
      autoComplete="off"
      className={classes}
    />
  );
}
