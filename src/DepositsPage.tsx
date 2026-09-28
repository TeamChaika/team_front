import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconRefresh,
  IconSearch,
  IconUsers,
  IconPlus,
} from "@tabler/icons-react";
import { apiBlob, dateText, money } from "./api";
import { Feedback, PageTitle } from "./pages";
import { useData } from "./useData";
import { CreateDeposit } from "./CreateDeposit";
import "./deposits.css";

type Deposit = {
  id: string;
  customer_name: string;
  phone: string;
  amount: number;
  restaurant: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  reservation_date: string | null;
  notes: string | null;
};
type DepositPage = {
  items: Deposit[];
  total: number;
  page: number;
  page_size: number;
};
type Filters = {
  query: string;
  status_filter: string;
  restaurant: string;
  min_amount: string;
  max_amount: string;
  date_from: string;
  date_to: string;
};
const empty: Filters = {
  query: "",
  status_filter: "",
  restaurant: "",
  min_amount: "",
  max_amount: "",
  date_from: "",
  date_to: "",
};
const statuses: Record<string, { label: string; color: string }> = {
  pending: { label: "Ожидает оплаты", color: "yellow" },
  paid: { label: "Оплачен", color: "teal" },
  failed: { label: "Ошибка", color: "red" },
};
function Status({ value }: { value: string }) {
  const item = statuses[value] ?? { label: value, color: "gray" };
  return (
    <Badge color={item.color} variant="light">
      {item.label}
    </Badge>
  );
}
const guestLink = (id: string) =>
  `https://pay.chaika.team/deposit/${encodeURIComponent(id)}`;

function DepositCard({ id, onClose }: { id: string; onClose: () => void }) {
  const state = useData<Deposit>(`/deposits/${encodeURIComponent(id)}`);
  const [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const item = state.data;
  async function copy() {
    try {
      await navigator.clipboard.writeText(guestLink(id));
      setCopied(true);
      setError("");
    } catch {
      setError("Не удалось скопировать ссылку. Её можно открыть кнопкой ниже.");
    }
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title="Карточка депозита"
      size="lg"
      centered
    >
      <Feedback state={state}>
        {item && (
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="xl" fw={700}>
                {money(item.amount)} ₽
              </Text>
              <Status value={item.status} />
            </Group>
            <dl className="deposit-details">
              <dt>Гость</dt>
              <dd>{item.customer_name}</dd>
              <dt>Телефон</dt>
              <dd>{item.phone}</dd>
              <dt>Заведение</dt>
              <dd>{item.restaurant}</dd>
              <dt>Бронирование</dt>
              <dd>{dateText(item.reservation_date)}</dd>
              <dt>Создан</dt>
              <dd>{dateText(item.created_at)}</dd>
              <dt>Оплачен</dt>
              <dd>{dateText(item.paid_at)}</dd>
              <dt>Комментарий</dt>
              <dd className="deposit-note">{item.notes || "—"}</dd>
            </dl>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            <Group>
              <Button
                variant="light"
                leftSection={<IconCopy size={16} />}
                onClick={copy}
              >
                {copied ? "Ссылка скопирована" : "Скопировать ссылку гостю"}
              </Button>
              <Button
                component="a"
                href={guestLink(id)}
                target="_blank"
                rel="noopener noreferrer"
                variant="subtle"
                leftSection={<IconExternalLink size={16} />}
              >
                Открыть на pay.chaika.team
              </Button>
            </Group>
          </Stack>
        )}
      </Feedback>
    </Modal>
  );
}

export function DepositsPage() {
  const [draft, setDraft] = useState<Filters>({ ...empty }),
    [filters, setFilters] = useState<Filters>({ ...empty });
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState("20");
  const [sort, setSort] = useState("created_at:desc");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const venues = useData<string[]>("/deposits/venues");
  const creationVenues = useData<string[]>("/deposits/creation-venues");
  const permissions = useData<{ can_manage_access: boolean }>(
    "/deposits/permissions",
  );
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value)
      params.set(
        key,
        key === "date_from"
          ? `${value}T00:00:00+03:00`
          : key === "date_to"
            ? `${value}T23:59:59.999999+03:00`
            : value,
      );
  }
  params.set("page", String(page));
  params.set("page_size", pageSize);
  const [sortBy, sortDir] = sort.split(":");
  params.set("sort_by", sortBy);
  params.set("sort_dir", sortDir);
  const state = useData<DepositPage>("/deposits?" + params.toString());
  const pages = Math.max(
    1,
    Math.ceil((state.data?.total ?? 0) / Number(pageSize)),
  );
  const field = (key: keyof Filters, value: string) =>
    setDraft((old) => ({ ...old, [key]: value }));
  function apply(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      setError("Дата окончания должна быть не раньше начала.");
      return;
    }
    if (
      draft.min_amount &&
      draft.max_amount &&
      Number(draft.min_amount) > Number(draft.max_amount)
    ) {
      setError("Максимальная сумма должна быть не меньше минимальной.");
      return;
    }
    setPage(1);
    setFilters({ ...draft });
  }
  async function exportFile() {
    setExporting(true);
    setError("");
    setNotice("");
    try {
      const blob = await apiBlob("/deposits/export?" + params.toString());
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "deposits.xlsx";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Файл Excel готов. В выгрузке до 1000 депозитов по применённым фильтрам.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="deposits-page">
      <PageTitle
        title="Депозиты"
        subtitle="Бронирования, статусы оплаты и ссылки для гостей"
        action={
          <Group gap="xs">
            {!!creationVenues.data?.length && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setCreating(true)}
              >
                Создать депозит
              </Button>
            )}
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={state.reload}
              disabled={state.loading}
            >
              Обновить
            </Button>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={exportFile}
              loading={exporting}
            >
              Экспорт Excel
            </Button>
            {permissions.data?.can_manage_access && (
              <Button
                variant="light"
                leftSection={<IconUsers size={16} />}
                component={Link}
                to="/management"
              >
                Доступы
              </Button>
            )}
          </Group>
        }
      />
      <Text size="sm" c="dimmed" mb="lg">
        Здесь показаны доступные вам заведения. Гости оплачивают по прежним
        ссылкам на pay.chaika.team.
      </Text>
      {(error || permissions.error || venues.error || creationVenues.error) && (
        <Alert color="red" role="alert" mb="md">
          {error || permissions.error || venues.error || creationVenues.error}
        </Alert>
      )}
      {notice && (
        <Alert color="teal" role="status" mb="md">
          {notice}
        </Alert>
      )}
      <form className="deposits-filters" onSubmit={apply}>
        <TextInput
          label="Поиск"
          placeholder="Имя, телефон, комментарий"
          value={draft.query}
          onChange={(e) => field("query", e.currentTarget.value)}
          maxLength={200}
          leftSection={<IconSearch size={16} />}
        />
        <Select
          label="Статус"
          clearable
          placeholder="Все статусы"
          value={draft.status_filter || null}
          onChange={(v) => field("status_filter", v ?? "")}
          data={Object.entries(statuses).map(([value, s]) => ({
            value,
            label: s.label,
          }))}
        />
        <Select
          label="Заведение"
          clearable
          searchable
          placeholder="Все доступные"
          data={venues.data ?? []}
          value={draft.restaurant || null}
          onChange={(v) => field("restaurant", v ?? "")}
        />
        <TextInput
          label="Сумма от, ₽"
          type="number"
          min="0"
          step="any"
          value={draft.min_amount}
          onChange={(e) => field("min_amount", e.currentTarget.value)}
        />
        <TextInput
          label="Сумма до, ₽"
          type="number"
          min="0"
          step="any"
          value={draft.max_amount}
          onChange={(e) => field("max_amount", e.currentTarget.value)}
        />
        <TextInput
          label="Создан с"
          type="date"
          value={draft.date_from}
          onChange={(e) => field("date_from", e.currentTarget.value)}
        />
        <TextInput
          label="Создан по"
          type="date"
          min={draft.date_from || undefined}
          value={draft.date_to}
          onChange={(e) => field("date_to", e.currentTarget.value)}
        />
        <Group gap="xs" className="deposits-filter-actions">
          <Button type="submit">Применить</Button>
          <Button
            variant="subtle"
            onClick={() => {
              setDraft({ ...empty });
              setFilters({ ...empty });
              setPage(1);
              setError("");
              setNotice("");
            }}
          >
            Сбросить
          </Button>
        </Group>
      </form>
      <div className="deposits-toolbar">
        <Text size="sm" c="dimmed">
          {state.loading
            ? "Загружаем депозиты…"
            : state.data
              ? `Найдено: ${state.data.total}`
              : ""}
        </Text>
        <Select
          aria-label="Сортировка депозитов"
          value={sort}
          onChange={(v) => {
            if (v) {
              setSort(v);
              setPage(1);
            }
          }}
          data={[
            { value: "created_at:desc", label: "Сначала новые" },
            { value: "created_at:asc", label: "Сначала старые" },
            { value: "amount:desc", label: "Сумма по убыванию" },
            { value: "amount:asc", label: "Сумма по возрастанию" },
            { value: "paid_at:desc", label: "Последние оплаты" },
          ]}
        />
      </div>
      <Feedback state={state}>
        {!state.data?.items.length ? (
          <div className="empty">
            <h2>Депозитов не найдено</h2>
            <p>
              Измените фильтры. Если доступ ещё не назначен, обратитесь к
              администратору депозитов.
            </p>
          </div>
        ) : (
          <div className="deposits-table-scroll">
            <table className="deposits-table">
              <thead>
                <tr>
                  <th>Создан</th>
                  <th>Гость</th>
                  <th>Телефон</th>
                  <th>Заведение</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Бронирование</th>
                  <th>Оплачен</th>
                </tr>
              </thead>
              <tbody>
                {state.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>{dateText(d.created_at)}</td>
                    <td>
                      <button
                        className="deposit-guest"
                        onClick={() => setSelected(d.id)}
                      >
                        {d.customer_name || "Открыть депозит"}
                      </button>
                    </td>
                    <td>{d.phone}</td>
                    <td>{d.restaurant}</td>
                    <td className="deposit-amount">{money(d.amount)} ₽</td>
                    <td>
                      <Status value={d.status} />
                    </td>
                    <td>{dateText(d.reservation_date)}</td>
                    <td>{dateText(d.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Feedback>
      <div className="deposits-pagination">
        <Text size="sm" c="dimmed">
          Страница {page} из {pages}
        </Text>
        <Group gap="xs">
          <Button
            variant="light"
            size="xs"
            disabled={page <= 1 || state.loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </Button>
          <Button
            variant="light"
            size="xs"
            disabled={page >= pages || state.loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
          </Button>
          <Select
            aria-label="Депозитов на странице"
            value={pageSize}
            onChange={(v) => {
              if (v) {
                setPageSize(v);
                setPage(1);
              }
            }}
            data={["20", "50", "100"].map((v) => ({
              value: v,
              label: v + " на странице",
            }))}
            w={160}
          />
        </Group>
      </div>
      {selected && (
        <DepositCard
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
      {creating && (
        <CreateDeposit
          venues={creationVenues.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={state.reload}
        />
      )}
    </section>
  );
}
