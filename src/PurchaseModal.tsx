import { Modal, type ModalProps } from "@mantine/core";
import "./purchase-prices.css";

export function PurchaseModal(props: ModalProps) {
  return (
    <Modal
      {...props}
      classNames={{
        inner: "purchase-modal-inner",
        content: "purchase-modal-content",
        header: "purchase-modal-header",
        title: "purchase-modal-title",
        body: "purchase-modal-body",
        close: "purchase-modal-close",
      }}
    />
  );
}
