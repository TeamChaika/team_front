import { useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import { api, ApiError, money } from "./api";

export function CreateDeposit({
  venues,
  onClose,
  onCreated,
}: {
  venues: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const initial = () => ({
    name: "",
    phone: "",
    amount: "",
    venue: venues.length === 1 ? venues[0] : "",
    date: "",
    time: "12:00",
    notes: "",
  });
  const [draft, setDraft] = useState(initial);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<{
    id: string;
    amount: number;
    restaurant: string;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  const submitting = useRef(false);
  const field = (key: keyof typeof draft, value: string) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const link = result
    ? `https://pay.chaika.team/deposit/${encodeURIComponent(result.id)}`
    : "";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const phone = draft.phone.replace(/\D/g, "");
    if (!/^[+0-9 ()-]+$/.test(draft.phone) || !/^[0-9]{10,15}$/.test(phone)) {
      setError("Укажите номер телефона: от 10 до 15 цифр.");
      return;
    }
    if (!Number.isInteger(Number(draft.amount)) || Number(draft.amount) < 1) {
      setError("Укажите сумму в целых рублях, от 1 ₽.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const created = await api<{
        id: string;
        amount: number;
        restaurant: string;
      }>("/deposits", {
        method: "POST",
        body: JSON.stringify({
          request_id: requestId,
          customer_name: draft.name.trim(),
          phone,
          amount: Number(draft.amount),
          restaurant: draft.venue,
          reservation_date: draft.date
            ? `${draft.date}T${draft.time || "12:00"}:00+03:00`
            : null,
          notes: draft.notes.trim() || null,
        }),
      });
      setResult(created);
      onCreated();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Не удалось подтвердить создание. Повторите отправку этой формы: повтор не создаст второй депозит.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setError("");
    } catch {
      setError(
        "Не удалось скопировать. Выделите ссылку в поле и скопируйте вручную.",
      );
    }
  }
  return (
    <Modal
      opened
      onClose={onClose}
      title={result ? "Депозит создан" : "Создать депозит"}
      size="lg"
      centered
      withCloseButton={!busy}
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
    >
      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}
      {result ? (
        <Stack>
          <Alert color="teal">
            Ссылка для гостя готова. {result.restaurant} ·{" "}
            {money(result.amount)} ₽
          </Alert>
          <TextInput
            label="Ссылка для оплаты"
            value={link}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button leftSection={<IconCopy size={16} />} onClick={copy}>
            {copied ? "Ссылка скопирована" : "Скопировать ссылку гостю"}
          </Button>
          <Text size="sm" c="dimmed">
            Отправьте ссылку гостю. Оплата откроется на pay.chaika.team.
          </Text>
          <Group>
            <Button
              variant="light"
              onClick={() => {
                setResult(null);
                setDraft(initial());
                setRequestId(crypto.randomUUID());
                setError("");
                setCopied(false);
              }}
            >
              Создать ещё
            </Button>
            <Button variant="subtle" onClick={onClose}>
              Готово
            </Button>
          </Group>
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack>
            <Text size="sm" c="dimmed">
              Выберите заведение и укажите данные гостя, чтобы получить ссылку
              для оплаты.
            </Text>
            <Select
              label="Заведение для депозита"
              placeholder="Выберите заведение"
              required
              searchable
              data={venues}
              value={draft.venue || null}
              onChange={(v) => field("venue", v ?? "")}
              disabled={busy}
            />
            <TextInput
              label="Имя гостя"
              required
              maxLength={100}
              value={draft.name}
              onChange={(e) => field("name", e.currentTarget.value)}
              disabled={busy}
            />
            <div className="deposit-create-grid">
              <TextInput
                label="Телефон гостя"
                type="tel"
                placeholder="+7 (___) ___-__-__"
                autoComplete="tel"
                required
                maxLength={24}
                value={draft.phone}
                onChange={(e) => field("phone", e.currentTarget.value)}
                disabled={busy}
              />
              <TextInput
                label="Сумма депозита, ₽"
                description="В целых рублях, без копеек"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                required
                value={draft.amount}
                onChange={(e) => field("amount", e.currentTarget.value)}
                disabled={busy}
              />
              <TextInput
                label="Дата бронирования"
                description="Необязательно"
                type="date"
                value={draft.date}
                onChange={(e) => field("date", e.currentTarget.value)}
                disabled={busy}
              />
              <TextInput
                label="Время бронирования"
                description="Крым, UTC+3"
                type="time"
                value={draft.time}
                onChange={(e) => field("time", e.currentTarget.value)}
                disabled={busy || !draft.date}
              />
            </div>
            <Textarea
              label="Комментарий"
              maxLength={500}
              rows={3}
              value={draft.notes}
              onChange={(e) => field("notes", e.currentTarget.value)}
              disabled={busy}
            />
            <Button type="submit" loading={busy} disabled={!draft.venue}>
              Создать ссылку для оплаты
            </Button>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
