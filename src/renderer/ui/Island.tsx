import { PropsWithChildren } from "react";
import "./Island.css";

export interface IslandProps {
  className?: string;
  ariaLabel?: string;
}

export function Island({
  children,
  className,
  ariaLabel,
}: PropsWithChildren<IslandProps>) {
  return (
    <div
      className={["aim-island", className].filter(Boolean).join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}
