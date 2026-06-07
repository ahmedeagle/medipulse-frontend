import { useEffect, useRef } from 'react';
import {
  useInfiniteQuery,
  type QueryKey,
} from '@tanstack/react-query';
import { DEFAULT_PAGE_SIZE, type PaginatedResult } from '../types/pagination';

interface UseInfiniteListOptions<T> {
  /** Stable query key (must NOT include offset/limit). */
  queryKey: QueryKey;
  /** Fetch one page; receives limit + offset. Must resolve to a paginated envelope. */
  fetchPage: (args: { limit: number; offset: number }) => Promise<PaginatedResult<T>>;
  /** Page size. Defaults to DEFAULT_PAGE_SIZE (25). */
  pageSize?: number;
  /** Disable the query (e.g. tab not active). */
  enabled?: boolean;
}

/**
 * Infinite-scroll variant of usePaginatedList for chronological / append-only
 * streams (audit logs, activity feeds). Pages keep accumulating into a flat
 * `items` array. Pair with the `<InfiniteScrollSentinel>` component to trigger
 * `loadMore` when the bottom of the list scrolls into view.
 */
export function useInfiniteList<T>({
  queryKey,
  fetchPage,
  pageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
}: UseInfiniteListOptions<T>) {
  const q = useInfiniteQuery({
    queryKey: [...(queryKey as any[]), 'infinite', pageSize],
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchPage({ limit: pageSize, offset: pageParam as number }),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + (p.data?.length ?? 0), 0);
      if (loaded >= lastPage.total) return undefined;
      return loaded;
    },
  });

  const items = (q.data?.pages.flatMap((p) => p.data) ?? []) as T[];
  const total = q.data?.pages[0]?.total ?? 0;

  return {
    items,
    total,
    isLoading: q.isLoading,
    isFetching: q.isFetching,
    isFetchingNextPage: q.isFetchingNextPage,
    hasNextPage: !!q.hasNextPage,
    fetchNextPage: q.fetchNextPage,
    isError: q.isError,
    error: q.error,
    refetch: q.refetch,
  };
}

interface SentinelProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** Root margin for IntersectionObserver. Defaults to 200px below viewport. */
  rootMargin?: string;
  /** Optional explicit scroll-root element (for scrollable containers). */
  root?: Element | null;
}

/**
 * Drop-in sentinel: render at the end of a paginated list. When it scrolls
 * into view it triggers `onLoadMore`. Also provides a manual "load more"
 * button as fallback for users with reduced motion or screen readers.
 */
export function InfiniteScrollSentinel({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  rootMargin = '200px',
  root = null,
}: SentinelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root, rootMargin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore, root, rootMargin]);

  if (!hasNextPage) return null;
  return (
    <div ref={ref} className="py-4 flex items-center justify-center">
      {isFetchingNextPage ? (
        <span className="text-xs text-gray-400 animate-pulse">جارٍ التحميل…</span>
      ) : (
        <button
          type="button"
          onClick={onLoadMore}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          تحميل المزيد
        </button>
      )}
    </div>
  );
}
