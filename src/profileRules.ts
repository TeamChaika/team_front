export function telegramUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "t.me" &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function passwordValidationError(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): string | null {
  if (!currentPassword) return "Введите текущий пароль.";
  const error = newPasswordValidationError(newPassword, confirmPassword);
  if (error) return error;
  if (newPassword === currentPassword)
    return "Новый пароль должен отличаться от текущего.";
  return null;
}

export function newPasswordValidationError(
  newPassword: string,
  confirmPassword: string,
): string | null {
  if (newPassword.length < 8 || newPassword.length > 128)
    return "Новый пароль должен содержать от 8 до 128 символов.";
  if (newPassword !== confirmPassword) return "Новые пароли не совпадают.";
  return null;
}
