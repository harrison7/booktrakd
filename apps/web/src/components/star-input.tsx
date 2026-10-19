"use client";

import { useState } from "react";

/**
 * Half-star rating input (value 1–10). Each star has a left (½) and right (full) half;
 * clicking the current value clears it.
 */
export function StarInput({
  value,
  onChange,
  size = 28,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;

  return (
    <fieldset
      className="m-0 inline-flex min-w-0 select-none border-0 p-0"
      onMouseLeave={() => setHover(null)}
      aria-label="Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const full = star * 2;
        const fill = shown >= full ? 1 : shown === full - 1 ? 0.5 : 0;
        return (
          <span key={star} className="relative" style={{ width: size, height: size }}>
            <span
              className="absolute inset-0 leading-none text-border"
              style={{ fontSize: size }}
              aria-hidden
            >
              ★
            </span>
            <span
              className="absolute inset-0 overflow-hidden leading-none text-star"
              style={{ fontSize: size, width: `${fill * 100}%` }}
              aria-hidden
            >
              ★
            </span>
            {[full - 1, full].map((v, half) => (
              <button
                key={v}
                type="button"
                aria-pressed={value === v}
                aria-label={`${v / 2} stars`}
                className="absolute top-0 h-full w-1/2 cursor-pointer"
                style={{ left: half ? "50%" : 0 }}
                onMouseEnter={() => setHover(v)}
                onClick={() => onChange(value === v ? null : v)}
              />
            ))}
          </span>
        );
      })}
    </fieldset>
  );
}
