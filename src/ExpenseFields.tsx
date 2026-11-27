import { Select, Textarea, TextInput } from "@mantine/core";
import type { ReactNode } from "react";
import { paymentMethods } from "./profitLossModel";

export type ExpenseDraft = {
  expense_date: string;
  paid_date: string;
  amount: string;
  category: string;
  payment_method: string;
  comment: string;
};

export default function ExpenseFields({
  draft,
  categoryOptions,
  today,
  change,
  disabled = false,
  afterAmount,
}: {
  draft: ExpenseDraft;
  categoryOptions: { value: string; label: string }[];
  today: string;
  change: (name: keyof ExpenseDraft, value: string | null) => void;
  disabled?: boolean;
  afterAmount?: ReactNode;
}) {
  return (
    <>
      <div className="pl-fields">
        <Select
          label="Статья расхода"
          required
          placeholder="Выберите статью"
          data={categoryOptions}
          searchable
          value={draft.category || null}
          onChange={(v) => change("category", v)}
          disabled={disabled}
        />
        <TextInput
          label="Сумма, ₽"
          inputMode="decimal"
          required
          autoComplete="off"
          placeholder="0,00"
          value={draft.amount}
          disabled={disabled}
          onChange={(e) => change("amount", e.currentTarget.value)}
        />
        {afterAmount && (
          <div className="pl-inline-allocation">{afterAmount}</div>
        )}
        <TextInput
          type="date"
          label="Дата расхода"
          required
          description="Определяет период отчёта"
          value={draft.expense_date}
          disabled={disabled}
          onChange={(e) => change("expense_date", e.currentTarget.value)}
        />
        <TextInput
          type="date"
          label="Дата оплаты"
          max={today}
          description="Заполните, когда расход оплачен"
          value={draft.paid_date}
          disabled={disabled}
          onChange={(e) => change("paid_date", e.currentTarget.value)}
        />
      </div>
      <fieldset className="pl-payment-methods">
        <legend>
          Способ оплаты <span aria-hidden="true">*</span>
        </legend>
        <div>
          {Object.entries(paymentMethods).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="payment_method"
                value={value}
                checked={draft.payment_method === value}
                disabled={disabled}
                onChange={() => change("payment_method", value)}
                required
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Textarea
        label="Комментарий"
        autosize
        minRows={2}
        maxRows={5}
        maxLength={500}
        placeholder="За что или кому заплатили"
        value={draft.comment}
        disabled={disabled}
        onChange={(e) => change("comment", e.currentTarget.value)}
      />
    </>
  );
}
