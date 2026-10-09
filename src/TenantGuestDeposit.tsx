import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Container,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconCheck, IconRefresh, IconShieldCheck } from "@tabler/icons-react";
import {
  guestDepositRequest,
  safePaymentUrl,
  type GuestDeposit,
} from "./tenantGuestPayment";
import { tenantDateText } from "./tenantPaymentDates";

export function TenantGuestDeposit({
  apiOrigin,
  companyName,
  timezone = "Europe/Simferopol",
  depositId,
  token,
}: {
  apiOrigin: string;
  companyName: string;
  timezone?: string;
  depositId: string;
  token: string;
}) {
  const [deposit, setDeposit] = useState<GuestDeposit | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const prepareId = useRef(crypto.randomUUID());
  const reconcileId = useRef(crypto.randomUUID());
  const operation = useRef(false);
  const polling = useRef({ checks: 0, deadline: 0 });
  const mounted = useRef(true);
  const latest = useRef<GuestDeposit | null>(null);
  const update = useCallback((next: GuestDeposit) => {
    if (
      !mounted.current ||
      (latest.current && next.revision < latest.current.revision)
    )
      return;
    latest.current = next;
    setDeposit(next);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    guestDepositRequest(
      apiOrigin,
      { depositId, token },
      undefined,
      undefined,
      abort.signal,
    )
      .then(update)
      .catch((e) => {
        if (!abort.signal.aborted) setError((e as Error).message);
      });
    return () => {
      mounted.current = false;
      abort.abort();
    };
  }, [apiOrigin, depositId, token, update]);
  const act = useCallback(
    async (action: "prepare" | "reconcile") => {
      if (operation.current) return;
      operation.current = true;
      setBusy(true);
      setError("");
      try {
        const next = await guestDepositRequest(
          apiOrigin,
          { depositId, token },
          action,
          action === "prepare" ? prepareId.current : reconcileId.current,
          AbortSignal.timeout(20_000),
        );
        update(next);
        if (action === "reconcile") reconcileId.current = crypto.randomUUID();
      } catch (e) {
        if (mounted.current) setError((e as Error).message);
      } finally {
        operation.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [apiOrigin, depositId, token, update],
  );
  // Checking never creates a payment; pause when hidden and stop after five minutes.
  useEffect(() => {
    if (
      !deposit ||
      deposit.status === "paid" ||
      !["pending", "creating", "unknown"].includes(deposit.payment?.state ?? "")
    )
      return;
    if (!polling.current.deadline)
      polling.current.deadline = Date.now() + 300_000;
    const timer = window.setInterval(() => {
      if (
        Date.now() >= polling.current.deadline ||
        polling.current.checks >= 30
      ) {
        window.clearInterval(timer);
        return;
      }
      if (
        document.visibilityState === "visible" &&
        !operation.current &&
        polling.current.checks < 30
      ) {
        polling.current.checks++;
        void act("reconcile");
      }
      if (polling.current.checks >= 30) window.clearInterval(timer);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [deposit?.id, deposit?.status, deposit?.payment?.state, act]);
  const paid = deposit?.status === "paid" && !!deposit.paid_at;
  const sandbox = deposit?.payment?.mode === "sandbox";
  const state = deposit?.payment?.state;
  const expired =
    !!deposit?.payment?.valid_until &&
    Date.parse(deposit.payment.valid_until) <= Date.now();
  const paymentUrl =
    state === "pending" && !expired
      ? safePaymentUrl(deposit?.payment?.payment_url)
      : null;
  const qr =
    state === "pending" && !expired
      ? safePaymentUrl(deposit?.payment?.qr_image)
      : null;
  const uncertain = state === "unknown" || state === "creating";
  return (
    <Container size={520} py="xl">
      <Stack gap="lg">
        <Group gap="xs">
          <IconShieldCheck size={24} />
          <Text fw={700}>{companyName}</Text>
        </Group>
        <Paper withBorder radius="lg" p="xl" shadow="sm">
          <Stack gap="lg">
            <Title order={1} size="h2">
              {paid
                ? sandbox
                  ? "Тестовая оплата подтверждена"
                  : "Депозит оплачен"
                : "Оплата депозита"}
            </Title>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            {!deposit && !error && (
              <Text role="status">Проверяем данные бронирования…</Text>
            )}
            {deposit && (
              <>
                {sandbox && (
                  <Alert color="yellow">
                    Тестовый режим: это проверка сценария. Реальное списание
                    денег не подтверждается.
                  </Alert>
                )}
                <Text size="sm" c="dimmed">
                  {deposit.restaurant}
                </Text>
                <Text size="36px" fw={800}>
                  {new Intl.NumberFormat("ru-RU", {
                    style: "currency",
                    currency: deposit.currency,
                  }).format(deposit.amount_minor / 100)}
                </Text>
                {deposit.reservation_date && (
                  <Text size="sm">
                    Бронирование:{" "}
                    {tenantDateText(deposit.reservation_date, timezone)}
                  </Text>
                )}
                {paid ? (
                  <Alert color="teal" icon={<IconCheck />}>
                    {sandbox
                      ? "Тестовая операция завершена. Обратитесь в заведение для реальной оплаты."
                      : "Оплата подтверждена. Депозит сохранён за вашим бронированием."}
                  </Alert>
                ) : (
                  <>
                    <Badge
                      variant="light"
                      color={uncertain ? "orange" : "yellow"}
                    >
                      {uncertain ? "Уточняем статус" : "Ожидает оплаты"}
                    </Badge>
                    {uncertain && (
                      <Alert color="orange">
                        Результат операции пока неизвестен. Проверяйте статус;
                        дождитесь подтверждения перед новой оплатой.
                      </Alert>
                    )}
                    {(state === "failed" || state === "expired" || expired) && (
                      <Alert color="orange">
                        Ссылка на оплату больше недоступна. Свяжитесь с
                        заведением для продолжения.
                      </Alert>
                    )}
                    {qr && (
                      <img
                        src={qr}
                        alt="QR-код для оплаты депозита"
                        width={240}
                        height={240}
                        style={{ alignSelf: "center", objectFit: "contain" }}
                        referrerPolicy="no-referrer"
                      />
                    )}
                    {paymentUrl && (
                      <Button
                        component="a"
                        href={paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        size="lg"
                      >
                        {sandbox
                          ? "Открыть тестовую оплату"
                          : "Перейти к оплате"}
                      </Button>
                    )}
                    {!deposit.payment && (
                      <Button
                        size="lg"
                        loading={busy}
                        onClick={() => void act("prepare")}
                      >
                        Подготовить оплату
                      </Button>
                    )}
                    <Button
                      variant="light"
                      loading={busy}
                      leftSection={<IconRefresh size={16} />}
                      onClick={() => void act("reconcile")}
                    >
                      Проверить статус оплаты
                    </Button>
                  </>
                )}
              </>
            )}
            <Text size="xs" c="dimmed">
              Сумма и заведение указаны в сохранённом депозите. При вопросах
              обратитесь в заведение.
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
