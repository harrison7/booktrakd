"use client";

import { useState } from "react";

/** Review text, hidden behind a click when it contains spoilers. */
export function SpoilerText({
  text,
  spoilers,
  clamp,
}: {
  text: string;
  spoilers: boolean;
  clamp?: boolean;
}) {
  const [revealed, setRevealed] = useState(!spoilers);
  const [expanded, setExpanded] = useState(!clamp);

  if (!revealed) {
    return (
      <p className="text-sm text-muted italic">
        This review may contain spoilers.{" "}
        <button type="button" onClick={() => setRevealed(true)} className="text-text underline">
          I can handle the truth.
        </button>
      </p>
    );
  }
  return (
    <div>
      <p className={`whitespace-pre-line ${expanded ? "" : "line-clamp-6"}`}>{text}</p>
      {!expanded && text.length > 400 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 font-sans text-xs uppercase tracking-wider text-muted hover:text-text"
        >
          More
        </button>
      )}
    </div>
  );
}
