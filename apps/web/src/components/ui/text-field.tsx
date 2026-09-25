"use client";

import { Field } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";

type ControlProps = Omit<ComponentProps<typeof Field.Control>, "className" | "name">;

interface TextFieldProps extends ControlProps {
  name: string;
  label: string;
  description?: ReactNode;
  /** Client-side check; return a message to show, or null when valid. */
  validate?: (value: string) => string | null;
  /** Rendered inside the field before the value, e.g. "@" or "/app/". */
  prefix?: string;
  /** Rendered inside the input's right edge, e.g. a reveal toggle. */
  trailing?: ReactNode;
}

/*
 * A field is a chip you type into: a solid tone off the surface, no border, big round corners. Focus
 * rings it in the surface's highlight, and in the alert colour when it is wrong.
 */
export function TextField({ name, label, description, validate, prefix, trailing, ...control }: TextFieldProps) {
  return (
    <Field.Root
      name={name}
      validate={validate ? (value) => validate(typeof value === "string" ? value : "") : undefined}
      className="flex flex-col gap-1.5"
    >
      <Field.Label className="text-base font-bold text-fg">{label}</Field.Label>
      <div className="flex h-12 items-center rounded-field bg-chip transition-[box-shadow] duration-150 has-[:focus-visible]:inset-ring-2 has-[:focus-visible]:inset-ring-hi has-[[data-invalid]]:inset-ring-2 has-[[data-invalid]]:inset-ring-alert">
        {prefix && (
          <span aria-hidden="true" className="pointer-events-none shrink-0 pl-4 text-md text-fg-2 select-none">
            {prefix}
          </span>
        )}
        <Field.Control
          {...control}
          className={`h-full min-w-0 flex-1 bg-transparent text-md text-on-chip outline-none placeholder:text-fg-2 ${prefix ? "pl-0.5" : "pl-4"} ${trailing ? "pr-1" : "pr-4"}`}
        />
        {trailing && <div className="flex shrink-0 items-center pr-1">{trailing}</div>}
      </div>
      {/* The error takes the helper line's place rather than repeating it underneath. */}
      {description && <Field.Description className="text-sm text-fg-2 data-[invalid]:hidden">{description}</Field.Description>}
      <Field.Error className="field-error text-sm font-medium text-alert" />
    </Field.Root>
  );
}
