import { type ReactNode } from "react";

type CardProps = {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Card({ title, children, className }: CardProps) {
  const classes = [
    "rounded-xl border border-gray-200 bg-white p-5 shadow-sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      {title && (
        <h2 className="mb-4 text-sm font-semibold text-gray-500">{title}</h2>
      )}
      <div>{children}</div>
    </div>
  );
}
