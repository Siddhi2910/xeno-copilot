'use client';

import { useEffect, useState } from 'react';

export function useRotatingCopy(phrases: string[], intervalMs = 2500) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (phrases.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % phrases.length), intervalMs);
    return () => clearInterval(t);
  }, [phrases, intervalMs]);
  return phrases[index] ?? phrases[0];
}
