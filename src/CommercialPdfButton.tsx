import { useState } from "react";
import { Alert, Button, Stack } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { apiPdf } from "./api";

export function CommercialPdfButton({
  path,
  name,
}: {
  path: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const blob = await apiPdf(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name + ".pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось скачать счёт.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack gap="xs">
      <Button
        variant="light"
        leftSection={<IconDownload size={16} />}
        loading={busy}
        onClick={download}
      >
        Счёт на оплату · PDF
      </Button>
      {error && <Alert color="red">{error}</Alert>}
    </Stack>
  );
}
