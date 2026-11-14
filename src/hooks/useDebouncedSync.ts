import { useEffect, useRef, useCallback } from 'react';

export function useDebouncedSync<T extends (...args: any[]) => any>(
  callback: T,
  delay = 600
) {
  const callbackRef = useRef<T>(callback);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const debouncedTrigger = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        if (callbackRef.current) {
          callbackRef.current(...args);
        }
      }, delay);
    },
    [delay]
  );

  const flush = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (callbackRef.current) {
      callbackRef.current(...args);
    }
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return { debouncedTrigger, flush, cancel };
}

export default useDebouncedSync;
