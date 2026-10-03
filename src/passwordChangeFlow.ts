export function createPasswordChangeFlow() {
  let saved = false;
  return {
    get saved() {
      return saved;
    },
    async continue(
      submit: () => Promise<void>,
      verify: () => Promise<void>,
      onSaved: () => void,
    ) {
      if (!saved) {
        await submit();
        saved = true;
        onSaved();
      }
      await verify();
    },
    reset() {
      saved = false;
    },
  };
}
