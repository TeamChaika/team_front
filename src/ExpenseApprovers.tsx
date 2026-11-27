import { Button, Group, NativeSelect, Stack } from "@mantine/core";
import type { ExpenseApprover } from "./profitLossModel";

export type ApproverField = {
  departmentId: string;
  department: string;
  value: string;
  options: ExpenseApprover[];
  saved?: { approver_id?: string | null; approver_name?: string | null };
};

export function ExpenseApprovers({
  fields,
  disabled,
  onChoose,
}: {
  fields: ApproverField[];
  disabled: boolean;
  onChoose: (departments: string[], id: string) => void;
}) {
  if (!fields.some((field) => field.options.length || field.saved?.approver_id))
    return null;
  const multiple = fields.length > 1;
  const common = multiple
    ? fields[0].options.filter(
        (option) =>
          option.available_to_all &&
          fields.every((field) =>
            field.options.some(({ id }) => id === option.id),
          ),
      )
    : [];
  return (
    <Stack gap="xs">
      {fields.map(({ departmentId, department, value, options, saved }) => {
        const data = options.map(({ id, name }) => ({
          value: id,
          label:
            saved?.approver_id === id && saved.approver_name
              ? saved.approver_name
              : name,
        }));
        if (
          saved?.approver_id &&
          saved.approver_name &&
          !data.some((o) => o.value === saved.approver_id)
        )
          data.push({ value: saved.approver_id, label: saved.approver_name });
        if (!data.length) return null;
        return (
          <NativeSelect
            key={departmentId}
            label={
              multiple ? `Кто согласовал — ${department}` : "Кто согласовал"
            }
            data={[
              { value: "", label: "Выберите согласующего", disabled: true },
              ...data,
            ]}
            value={value}
            required={options.length > 0}
            disabled={disabled}
            onChange={(event) =>
              onChoose([departmentId], event.currentTarget.value)
            }
          />
        );
      })}
      {common.length > 0 && !disabled && (
        <Group gap="xs">
          {common.map(({ id, name }) => (
            <Button
              key={id}
              type="button"
              size="xs"
              variant="subtle"
              disabled={fields.every((field) => field.value === id)}
              onClick={() =>
                onChoose(
                  fields.map((field) => field.departmentId),
                  id,
                )
              }
            >
              Для всех — {name}
            </Button>
          ))}
        </Group>
      )}
    </Stack>
  );
}
