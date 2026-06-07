/**
 * Standard pagination contract — mirrors backend `PaginationQueryDto` /
 * `PaginatedResult<T>` in src/common/pagination/pagination-query.dto.ts.
 *
 * Every list endpoint accepts { limit, offset } and returns
 * { data, total, limit, offset } so the same hook + UI works everywhere.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}
