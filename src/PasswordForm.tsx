import { useRef, useState, type FormEvent } from "react";
import { Alert, Button, PasswordInput, Stack, Text } from "@mantine/core";
import { api } from "./api";
import { createPasswordChangeFlow } from "./passwordChangeFlow";
import { passwordValidationError } from "./profileRules";

export function PasswordForm({
  required = false,
  onSuccess,
}: {
  required?: boolean;
  onSuccess?: () => Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inFlight = useRef(false);
  const flow = useRef(createPasswordChangeFlow());
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    setError("");
    setSuccess("");
    if (!flow.current.saved) {
      const validationError = passwordValidationError(
        currentPassword,
        newPassword,
        confirmPassword,
      );
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await flow.current.continue(
        async () => {
          await api<{ status: "ok" }>("/profile/password", {
            method: "POST",
            body: JSON.stringify({
              current_password: currentPassword,
              new_password: newPassword,
            }),
          });
        },
        onSuccess ??
          (async () => {
            setSuccess("Пароль изменён.");
            flow.current.reset();
            setSaved(false);
          }),
        () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setSaved(true);
        },
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Stack gap="md" component="form" onSubmit={save}>
      <Text size="sm" c="dimmed">
        Для изменения введите текущий пароль и придумайте новый длиной от 8 до
        128 символов.
      </Text>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {success && (
        <Alert color="green" role="status">
          {success}
        </Alert>
      )}
      {saved && (
        <Text size="sm" role="status">
          Новый пароль сохранён. Проверьте доступ, чтобы продолжить.
        </Text>
      )}
      {!saved && (
        <PasswordInput
          label="Текущий пароль"
          autoComplete={required ? "off" : "current-password"}
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.currentTarget.value)}
        />
      )}
      {!saved && (
        <PasswordInput
          label="Новый пароль"
          autoComplete={required ? "off" : "new-password"}
          required
          minLength={8}
          maxLength={128}
          value={newPassword}
          onChange={(e) => setNewPassword(e.currentTarget.value)}
        />
      )}
      {!saved && (
        <PasswordInput
          label="Повторите новый пароль"
          autoComplete={required ? "off" : "new-password"}
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.currentTarget.value)}
        />
      )}
      <Button type="submit" loading={busy} disabled={busy}>
        {saved
          ? error
            ? "Повторить проверку"
            : "Продолжить"
          : required
            ? "Сохранить и продолжить"
            : "Сохранить новый пароль"}
      </Button>
    </Stack>
  );
}
