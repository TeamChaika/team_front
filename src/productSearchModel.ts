export type SearchProduct = {
  id: string;
  name: string;
  article?: string;
  unit_name?: string;
  unit?: string;
};

export function productSearchMetadata(product: SearchProduct): string {
  return [product.article, product.unit_name || product.unit]
    .filter(Boolean)
    .join(" · ");
}

// The server ranks fuzzy matches; applying a substring filter here loses them.
export function serverRankedProductOptions<T extends object>({
  options,
  ids,
}: {
  options: T[];
  ids: string[];
}): T[] {
  const ranked = new Set(ids);
  return options.filter(
    (option) => "value" in option && ranked.has(String(option.value)),
  );
}

export function currentProductRows<T>(
  scope: string,
  query: string,
  result: { scope: string; query: string; rows: T[] } | null,
): T[] {
  return query.length >= 2 && result?.scope === scope && result.query === query
    ? result.rows
    : [];
}

export function startProductSearch<T>({
  load,
  result,
  error,
  delay = 250,
}: {
  load: (signal: AbortSignal) => Promise<T[]>;
  result: (rows: T[]) => void;
  error: (message: string) => void;
  delay?: number;
}): () => void {
  let live = true;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    load(controller.signal)
      .then((rows) => {
        if (live) result(rows);
      })
      .catch((e: Error) => {
        if (live && e.name !== "AbortError") error(e.message);
      });
  }, delay);
  return () => {
    live = false;
    clearTimeout(timer);
    controller.abort();
  };
}
