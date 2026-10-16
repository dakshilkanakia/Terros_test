import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

/** A request to run `load` again. `background` keeps the current data on screen while it runs. */
interface Reload {
  background: boolean;
  done?: () => void;
}

export interface AsyncResult {
  /** Starts over with the loading state. Use it to retry after an error. */
  reload: () => void;
  /**
   * Fetches again without leaving the success state. Resolves once the fetch settles.
   * If there is no data yet, it behaves like `reload`.
   */
  refresh: () => Promise<void>;
  refreshing: boolean;
  /** Set when the last `refresh` failed. The previous data stays in place. */
  refreshError: Error | null;
}

const idleRefresh = { refreshing: false, refreshError: null as Error | null };

/** Runs `load` whenever `deps` change and tracks its loading, success, and error states. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> & AsyncResult {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const [refreshState, setRefreshState] = useState(idleRefresh);
  const [request, setRequest] = useState<Reload>({ background: false });

  const stateRef = useRef(state);
  stateRef.current = state;
  const handled = useRef(request);

  useEffect(() => {
    // Only a new request can be a background one; a change in `deps` always starts over.
    const silent = request !== handled.current && request.background && stateRef.current.status === "success";
    handled.current = request;

    let cancelled = false;
    if (silent) {
      setRefreshState({ refreshing: true, refreshError: null });
    } else {
      setState({ status: "loading" });
      setRefreshState(idleRefresh);
    }

    load().then(
      (data) => {
        if (cancelled) return;
        setState({ status: "success", data });
        setRefreshState(idleRefresh);
        request.done?.();
      },
      (error: unknown) => {
        if (cancelled) return;
        const failure = error instanceof Error ? error : new Error(String(error));
        if (silent) {
          setRefreshState({ refreshing: false, refreshError: failure });
        } else {
          setState({ status: "error", error: failure });
        }
        request.done?.();
      },
    );
    return () => {
      cancelled = true;
      request.done?.();
    };
  }, [...deps, request]);

  const reload = useCallback(() => setRequest({ background: false }), []);
  const refresh = useCallback(
    () => new Promise<void>((resolve) => setRequest({ background: true, done: resolve })),
    [],
  );
  return { ...state, ...refreshState, reload, refresh };
}
