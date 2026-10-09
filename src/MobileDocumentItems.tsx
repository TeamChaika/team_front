import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { useProductSearch } from "./useProductSearch";
import {
  productSearchMetadata,
  type SearchProduct,
} from "./productSearchModel";
import type { DocumentItem, DocumentKind } from "./documentModel";
import {
  formatMobileDocumentAmount,
  parseMobileDocumentAmount,
} from "./mobileDocumentAmount";
import "./mobileDocumentItems.css";

type Product = SearchProduct;
type Step = "draft" | "search" | "quantity";
export type MobileItemsNavigation = { back: () => boolean };

export function MobileDocumentItems({
  kind,
  items,
  change,
  disabled,
  onStepChange,
  navigation,
}: {
  kind: DocumentKind;
  items: DocumentItem[];
  change: (items: DocumentItem[]) => void;
  disabled: boolean;
  onStepChange: (open: boolean) => void;
  navigation: Ref<MobileItemsNavigation>;
}) {
  const [step, setStep] = useState<Step>("draft");
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Product | null>(null);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [recent, setRecent] = useState<Product[]>([]);
  const units = useRef(new Map<string, string>());
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const draftRows = useRef(new Map<string, HTMLDivElement>());
  const committedProduct = useRef<string | null>(null);
  const query = search.trim();
  const actualItems = items.filter((item) => item.product_id);
  function go(next: Step) {
    setStep(next);
    onStepChange(next !== "draft");
  }
  function back() {
    if (step === "draft") return false;
    go(step === "quantity" ? "search" : "draft");
    return true;
  }
  useImperativeHandle(navigation, () => ({ back }));
  useLayoutEffect(() => {
    if (step !== "draft") {
      heading.current?.scrollIntoView({ block: "start" });
      input.current?.focus({ preventScroll: true });
    } else if (committedProduct.current) {
      const addedRow = draftRows.current.get(committedProduct.current);
      addedRow?.focus({ preventScroll: true });
      addedRow?.scrollIntoView({ block: "nearest" });
      committedProduct.current = null;
    }
  }, [step]);
  const found = useProductSearch(
    `/documents/${kind}/products`,
    search,
    "query",
    step === "search",
    retry,
  );
  const { loading, error } = found;
  function select(product: Product) {
    if (
      disabled ||
      (!items.some((item) => item.product_id === product.id) &&
        actualItems.length >= 200)
    )
      return;
    setSelected(product);
    if (product.unit_name) units.current.set(product.id, product.unit_name);
    const existing = items.find((item) => item.product_id === product.id);
    setAmount(existing ? formatMobileDocumentAmount(existing.amount) : "");
    setAmountError("");
    go("quantity");
  }
  function commit() {
    if (disabled || !selected) return;
    const quantity = parseMobileDocumentAmount(amount);
    if (quantity === null) {
      setAmountError("Введите количество больше 0 и не больше 1 000 000 000.");
      input.current?.focus();
      return;
    }
    const exists = actualItems.some((item) => item.product_id === selected.id);
    if (!exists && actualItems.length >= 200) {
      setAmountError("В заявке может быть не больше 200 позиций.");
      return;
    }
    const row = {
      product_id: selected.id,
      name: selected.name,
      amount: quantity,
    };
    change(
      exists
        ? actualItems.map((item) =>
            item.product_id === selected.id ? { ...item, ...row } : item,
          )
        : [...actualItems, row],
    );
    setRecent((old) =>
      [selected, ...old.filter((p) => p.id !== selected.id)].slice(0, 8),
    );
    committedProduct.current = selected.id;
    setSearch("");
    go("draft");
  }
  const pendingSearch = query.length >= 2 && loading;
  const rows =
    query.length >= 2
      ? !error
        ? found.rows
        : []
      : query.length === 0
        ? recent
        : [];
  if (step === "draft")
    return (
      <section className="mobile-document-items" aria-label="Позиции заявки">
        <h3>Товары{actualItems.length ? ` · ${actualItems.length}` : ""}</h3>
        {actualItems.length === 0 && (
          <p className="mobile-items-status">Добавьте товары в заявку.</p>
        )}
        {actualItems.map((item) => (
          <div
            className="mobile-item-draft-row"
            key={item.product_id}
            tabIndex={-1}
            ref={(node) => {
              if (node) draftRows.current.set(item.product_id, node);
              else draftRows.current.delete(item.product_id);
            }}
          >
            <span className="mobile-item-name mobile-item-draft-name">
              {item.name || item.product_id}
            </span>
            <div className="mobile-item-draft-quantity">
              <input
                type="text"
                inputMode="decimal"
                required
                pattern={String.raw`\s*(?:\d+(?:[.,]\d*)?|[.,]\d+)\s*`}
                title="Введите количество цифрами; дробную часть отделите запятой или точкой."
                autoComplete="off"
                aria-label={`Количество: ${item.name || item.product_id}`}
                value={
                  typeof item.amount === "number"
                    ? formatMobileDocumentAmount(item.amount)
                    : item.amount
                }
                disabled={disabled}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                onChange={(event) =>
                  change(
                    items.map((row) =>
                      row.product_id === item.product_id
                        ? { ...row, amount: event.currentTarget.value }
                        : row,
                    ),
                  )
                }
              />
              {units.current.get(item.product_id) && (
                <span className="mobile-item-meta">
                  {units.current.get(item.product_id)}
                </span>
              )}
            </div>
            <button
              type="button"
              className="mobile-item-delete"
              aria-label={`Удалить ${item.name || item.product_id}`}
              disabled={disabled}
              onClick={() =>
                change(
                  items.filter((row) => row.product_id !== item.product_id),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="mobile-items-primary"
          disabled={disabled || actualItems.length >= 200}
          onClick={() => go("search")}
        >
          Добавить товар
        </button>
        {actualItems.length >= 200 && (
          <p className="mobile-items-status">
            Добавлено максимальное количество: 200 позиций.
          </p>
        )}
      </section>
    );
  return (
    <section
      className="mobile-document-items mobile-items-picker"
      aria-label={step === "search" ? "Поиск товара" : "Количество товара"}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement)
          event.preventDefault();
      }}
    >
      <div className="mobile-items-toolbar" ref={heading}>
        <button
          type="button"
          className="mobile-items-back"
          aria-label={step === "search" ? "Назад к заявке" : "Назад к поиску"}
          onClick={back}
        >
          ←
        </button>
        {step === "search" ? (
          <input
            ref={input}
            type="search"
            aria-label="Название или артикул"
            placeholder="Название или артикул"
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
            }}
            autoComplete="off"
          />
        ) : (
          <strong>Количество</strong>
        )}
      </div>
      {step === "search" ? (
        <>
          <div className="mobile-items-status" role="status" aria-live="polite">
            {query.length === 0
              ? recent.length
                ? "Недавние"
                : "Введите минимум 2 символа для поиска."
              : query.length < 2
                ? "Введите минимум 2 символа для поиска."
                : error
                  ? ""
                  : pendingSearch
                    ? "Ищем товары…"
                    : rows.length === 0
                      ? "Товары не найдены. Измените запрос."
                      : `Найдено: ${rows.length}`}
          </div>
          {error && (
            <div className="mobile-items-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="mobile-items-secondary"
                onClick={() => setRetry((x) => x + 1)}
              >
                Повторить поиск
              </button>
            </div>
          )}
          <div className="mobile-items-results">
            {rows.map((product) => {
              const existing = items.find(
                (item) => item.product_id === product.id,
              );
              return (
                <button
                  type="button"
                  className="mobile-item-result"
                  key={product.id}
                  onClick={() => select(product)}
                  disabled={
                    disabled || (!existing && actualItems.length >= 200)
                  }
                >
                  <span className="mobile-item-name">{product.name}</span>
                  {productSearchMetadata(product) && (
                    <span className="mobile-item-meta">
                      {productSearchMetadata(product)}
                    </span>
                  )}
                  {existing && (
                    <span className="mobile-item-existing">
                      В заявке: {formatMobileDocumentAmount(existing.amount)}
                      {product.unit_name ? ` ${product.unit_name}` : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        selected && (
          <div className="mobile-items-quantity">
            <h3>{selected.name}</h3>
            {items.some((item) => item.product_id === selected.id) && (
              <p className="mobile-items-status">
                Изменение количества позиции в заявке
              </p>
            )}
            <label htmlFor="mobile-document-amount">
              Количество{selected.unit_name ? `, ${selected.unit_name}` : ""}
            </label>
            <input
              id="mobile-document-amount"
              ref={input}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              aria-invalid={!!amountError}
              aria-describedby={
                amountError ? "mobile-document-amount-error" : undefined
              }
              onChange={(e) => {
                setAmount(e.currentTarget.value);
                setAmountError("");
              }}
            />
            {amountError && (
              <p
                id="mobile-document-amount-error"
                className="mobile-items-error"
                role="alert"
              >
                {amountError}
              </p>
            )}
            <button
              type="button"
              className="mobile-items-primary"
              disabled={disabled}
              onClick={commit}
            >
              {items.some((item) => item.product_id === selected.id)
                ? "Сохранить количество"
                : "Добавить в заявку"}
            </button>
          </div>
        )
      )}
    </section>
  );
}
