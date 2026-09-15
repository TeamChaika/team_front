import { useState } from "react";
import { Button, Checkbox, Popover, TextInput } from "@mantine/core";
import {
  IconBuildingStore,
  IconChevronDown,
  IconSearch,
} from "@tabler/icons-react";

type Restaurant = { id: string; name: string };

export function RestaurantPicker({
  restaurants,
  value,
  onChange,
}: {
  restaurants: Restaurant[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(value);
  const [search, setSearch] = useState("");
  const label = !value.length
    ? `Все рестораны (${restaurants.length})`
    : value.length === 1
      ? (restaurants.find((r) => r.id === value[0])?.name ??
        "Выбранный ресторан")
      : `Рестораны: ${value.length} из ${restaurants.length}`;
  const normalize = (text: string) =>
    text.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const matches = restaurants.filter((r) =>
    normalize(r.name).includes(normalize(search.trim())),
  );

  function toggle(id: string) {
    setDraft((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={320}
      shadow="md"
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <button
          type="button"
          className="restaurant-select restaurant-picker-trigger"
          aria-label={`Выбор ресторанов: ${label}`}
          aria-expanded={opened}
          onClick={() => {
            if (!opened) {
              setDraft(value);
              setSearch("");
            }
            setOpened(!opened);
          }}
        >
          <IconBuildingStore size={16} aria-hidden="true" />
          <span>{label}</span>
          <IconChevronDown size={14} aria-hidden="true" />
        </button>
      </Popover.Target>
      <Popover.Dropdown className="restaurant-picker-dropdown">
        <TextInput
          aria-label="Поиск ресторанов"
          placeholder="Найти ресторан…"
          leftSection={<IconSearch size={15} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          size="xs"
          data-autofocus
        />
        <Checkbox
          label={`Все рестораны (${restaurants.length})`}
          checked={draft.length === 0}
          onChange={() => setDraft([])}
          className="restaurant-picker-all"
        />
        <div
          className="restaurant-picker-options"
          role="group"
          aria-label="Список ресторанов"
        >
          {matches.map((restaurant) => (
            <Checkbox
              key={restaurant.id}
              label={restaurant.name}
              checked={draft.includes(restaurant.id)}
              onChange={() => toggle(restaurant.id)}
              className="restaurant-picker-option"
            />
          ))}
          {!matches.length && <p className="muted">Рестораны не найдены</p>}
        </div>
        <div className="restaurant-picker-actions">
          <span className="muted" aria-live="polite">
            {draft.length ? `Выбрано: ${draft.length}` : "Вся доступная сеть"}
          </span>
          <Button
            size="xs"
            onClick={() => {
              onChange([...draft].sort());
              setOpened(false);
            }}
          >
            Применить
          </Button>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
