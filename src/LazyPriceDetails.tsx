import { lazy, Suspense, type ComponentProps } from "react";

const PriceDetails = lazy(() =>
  import("./PurchasePrices").then((module) => ({ default: module.PriceDetails })),
);

export function LazyPriceDetails(props: ComponentProps<typeof PriceDetails>) {
  return (
    <Suspense fallback={<p role="status">Загружаем историю цены…</p>}>
      <PriceDetails {...props} />
    </Suspense>
  );
}
