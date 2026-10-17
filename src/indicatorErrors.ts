export function indicatorErrorMessage(message: string, status?: number): string {
  if (status === 423)
    return "Синхронизация выбранного заведения отключена. Выберите другое.";
  return message || "Не удалось загрузить показатель. Повторите попытку.";
}
