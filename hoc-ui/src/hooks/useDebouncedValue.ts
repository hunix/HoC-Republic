/**
 * useDebouncedValue — delays propagating a rapidly-changing value (e.g. search input)
 * so downstream computations (filtering 10K citizens) only run once the user pauses typing.
 *
 * @param value  The raw value to debounce
 * @param delayMs  Debounce delay in milliseconds (default: 250)
 * @returns The debounced value
 */

import { useState, useEffect, useRef } from "react";

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timerRef.current);
  }, [value, delayMs]);

  return debounced;
}
