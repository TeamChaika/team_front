import { useEffect, useState } from "react";
import { Combobox, TextInput, Loader, useCombobox } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { api } from "./api";

type Product = {
  id: string;
  name: string;
  code: string | null;
  num: string | null;
  unit: string | null;
};
export function BalanceSearch({
  scope,
  value,
  onChange,
  onSelect,
}: {
  scope: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (product: Product) => void;
}) {
  const box = useCombobox({ onDropdownClose: () => box.resetSelectedOption() });
  const [result, setResult] = useState<{
    key: string;
    rows: Product[];
    more: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const query = value.trim();
  const key = scope + "&q=" + encodeURIComponent(query);
  const rows = result?.key === key ? result.rows : [];
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setError("");
    setLoading(query.length >= 2);
    if (query.length < 2)
      return () => {
        live = false;
        controller.abort();
      };
    const timer = window.setTimeout(() => {
      api<{ rows: Product[]; has_more: boolean }>("/balance-products?" + key, {
        signal: controller.signal,
      })
        .then((data) => {
          if (live) setResult({ key, rows: data.rows, more: data.has_more });
        })
        .catch((e) => {
          if (live && e.name !== "AbortError")
            setError(
              "Подсказки недоступны. Можно воспользоваться кнопкой «Найти».",
            );
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, query.length]);
  return (
    <Combobox
      store={box}
      onOptionSubmit={(id) => {
        const product = rows.find((row) => row.id === id);
        if (product) {
          onSelect(product);
          box.closeDropdown();
        }
      }}
    >
      <Combobox.Target>
        <TextInput
          aria-label="Поиск по номенклатуре"
          placeholder="Название, артикул или код товара…"
          value={value}
          maxLength={150}
          leftSection={<IconSearch size={16} />}
          rightSection={loading ? <Loader size={14} /> : null}
          onChange={(e) => {
            onChange(e.currentTarget.value);
            box.resetSelectedOption();
            box.openDropdown();
          }}
          onFocus={() => box.openDropdown()}
          onClick={() => box.openDropdown()}
          onBlur={() => box.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options
          style={{ maxHeight: 320, overflowY: "auto" }}
          aria-label="Подсказки номенклатуры"
        >
          {rows.map((product) => (
            <Combobox.Option key={product.id} value={product.id}>
              <div>{product.name}</div>
              <small className="product-suggestion-meta">
                {product.num
                  ? "Артикул " + product.num
                  : product.code
                    ? "Код " + product.code
                    : "ID " + product.id.slice(0, 8)}
                {product.unit ? " · " + product.unit : ""}
              </small>
            </Combobox.Option>
          ))}
          {rows.length === 0 && (
            <Combobox.Empty>
              {query.length < 2
                ? "Введите хотя бы 2 символа"
                : loading
                  ? "Ищем номенклатуру…"
                  : error || "На выбранных складах такой позиции в снимке нет"}
            </Combobox.Empty>
          )}
        </Combobox.Options>
        {result?.key === key && result.more && (
          <Combobox.Footer>
            Первые 20 совпадений. Уточните название.
          </Combobox.Footer>
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}
