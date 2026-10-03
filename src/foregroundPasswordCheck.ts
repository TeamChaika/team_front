export async function checkForegroundPasswordRequirement(
  load: (signal: AbortSignal) => Promise<{
    user: { id: string; password_change_required?: boolean };
  }>,
  isCurrent: (userId: string) => boolean,
  signal: AbortSignal,
  onRequired: () => void,
) {
  const meta = await load(signal);
  if (
    !signal.aborted &&
    isCurrent(meta.user.id) &&
    meta.user.password_change_required
  )
    onRequired();
}
