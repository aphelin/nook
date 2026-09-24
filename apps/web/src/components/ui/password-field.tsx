"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { type ComponentProps, useState } from "react";
import { TextField } from "./text-field";

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, "type" | "trailing">;

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="grid size-10 place-items-center rounded-full text-fg-2 transition-colors hover:bg-hover hover:text-fg"
        >
          {visible ? <EyeSlash size={20} weight="bold" /> : <Eye size={20} weight="bold" />}
        </button>
      }
    />
  );
}
