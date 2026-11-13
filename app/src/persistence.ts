import { useEffect, useRef, useState, type SetStateAction } from "react";
import storage from "expo-sqlite/kv-store";
export { storage };
export function useDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cleared = useRef(false);
  const live = useRef(initial);
  useEffect(() => {
    try {
      const saved = storage.getItemSync(key);
      if (saved) {
        live.current = JSON.parse(saved) as T;
        setValue(live.current);
      } else storage.setItemSync(key, JSON.stringify(live.current));
    } catch (e) {
      setError(e as Error);
    }
    setReady(true);
  }, [key]);
  const update = (action: SetStateAction<T>) => {
    const next =
      typeof action === "function"
        ? (action as (v: T) => T)(live.current)
        : action;
    live.current = next;
    setValue(next);
    if (!cleared.current)
      try {
        storage.setItemSync(key, JSON.stringify(next));
        setError(null);
      } catch (e) {
        setError(e as Error);
      }
  };
  const clear = () => {
    cleared.current = true;
    storage.removeItemSync(key);
  };
  const reset = (next: T = initial) => {
    cleared.current = false;
    live.current = next;
    setValue(next);
    try {
      storage.setItemSync(key, JSON.stringify(next));
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  };
  return { value, setValue: update, ready, error, clear, reset };
}
