import type { KeyboardEvent } from "react";
import { ActionIcon, Group, NumberInput, Text } from "@mantine/core";

interface StepperButtonProps {
  size: "xs" | "sm" | "md";
  label?: string | undefined;
  onClick: () => void;
}

function DecrementButton({
  size,
  label,
  disabled,
  onClick,
}: StepperButtonProps & { disabled: boolean }) {
  return (
    <ActionIcon
      size={size}
      variant="default"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ? `Decrease ${label}` : "Decrease"}
    >
      −
    </ActionIcon>
  );
}

function IncrementButton({
  size,
  label,
  disabled,
  onClick,
}: StepperButtonProps & { disabled: boolean }) {
  return (
    <ActionIcon
      size={size}
      variant="default"
      onClick={onClick}
      disabled={disabled}
      aria-label={label ? `Increase ${label}` : "Increase"}
    >
      +
    </ActionIcon>
  );
}

interface CountStepperProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  size?: "xs" | "sm" | "md";
  // Used for the +/- buttons' aria-labels, e.g. "QB" -> "Increase QB".
  label?: string | undefined;
  // Text shown in place of a number when value is undefined, e.g. "Unlimited".
  placeholder?: string | undefined;
  // When true, decrementing below `min` clears the value to `undefined`
  // (shown as `placeholder`) instead of clamping at `min` - for fields where
  // blank means "no limit" rather than zero.
  nullable?: boolean;
  disabled?: boolean;
}

// A non-editable "− value +" control for small, low-range counts (roster
// slots, keeper years, etc.) where typing an arbitrary number isn't useful.
export function CountStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  size = "sm",
  label,
  placeholder,
  nullable = false,
  disabled = false,
}: CountStepperProps) {
  const handleDecrement = () => {
    if (value === undefined) return;
    const next = value - step;
    if (nullable && next < min) {
      onChange(undefined);
      return;
    }
    onChange(Math.max(min, next));
  };

  const handleIncrement = () => {
    if (value === undefined) {
      onChange(min);
      return;
    }
    const next = value + step;
    onChange(max === undefined ? next : Math.min(max, next));
  };

  return (
    <Group gap={4} align="center" wrap="nowrap">
      <DecrementButton
        size={size}
        label={label}
        disabled={disabled || value === undefined}
        onClick={handleDecrement}
      />
      <Text
        miw={28}
        ta="center"
        fw={600}
        {...(value === undefined ? { c: "dimmed" as const } : {})}
      >
        {value === undefined ? (placeholder ?? "—") : value}
      </Text>
      <IncrementButton
        size={size}
        label={label}
        disabled={disabled || (value !== undefined && max !== undefined && value >= max)}
        onClick={handleIncrement}
      />
    </Group>
  );
}

interface EditableNumberStepperProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  width?: number;
  size?: "xs" | "sm" | "md";
  // Used for the +/- buttons' aria-labels, e.g. "Bid" -> "Increase Bid".
  label?: string | undefined;
  // Placeholder shown in the input when value is undefined, e.g. "None".
  placeholder?: string | undefined;
  // When true, clearing the input calls onChange(undefined) instead of
  // coercing to 0 - for optional fields like an unset minimum cost.
  nullable?: boolean;
  disabled?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

// A "− [typeable input] +" control for values that can range higher (dollar
// amounts, bids, etc.) - the buttons handle quick increments, but the field
// stays a real NumberInput so an exact value can be typed in directly.
export function EditableNumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  width = 90,
  size = "sm",
  label,
  placeholder,
  nullable = false,
  disabled = false,
  onKeyDown,
}: EditableNumberStepperProps) {
  const handleDecrement = () => {
    if (value === undefined) return;
    const next = value - step;
    if (nullable && min !== undefined && next < min) {
      onChange(undefined);
      return;
    }
    onChange(min !== undefined ? Math.max(min, next) : next);
  };

  const handleIncrement = () => {
    if (value === undefined) {
      onChange(min ?? 0);
      return;
    }
    const next = value + step;
    onChange(max !== undefined ? Math.min(max, next) : next);
  };

  return (
    <Group gap={4} align="center" wrap="nowrap">
      <DecrementButton
        size={size}
        label={label}
        disabled={disabled || value === undefined}
        onClick={handleDecrement}
      />
      <NumberInput
        hideControls
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        step={step}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onChange={(val) => {
          if (val === "") {
            onChange(nullable ? undefined : 0);
            return;
          }
          onChange(Number(val));
        }}
        {...(prefix !== undefined ? { prefix } : {})}
        w={width}
        size={size}
        styles={{ input: { textAlign: "center", fontWeight: 600 } }}
      />
      <IncrementButton
        size={size}
        label={label}
        disabled={disabled || (value !== undefined && max !== undefined && value >= max)}
        onClick={handleIncrement}
      />
    </Group>
  );
}
