import { useEffect, useState } from 'react';

/** Returns `value` delayed by `delay` ms — used to throttle geocoding queries. */
export function useDebounce<T>(value: T, delay = 320): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
