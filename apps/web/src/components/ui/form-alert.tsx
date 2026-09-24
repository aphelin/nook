import { WarningCircle } from "@phosphor-icons/react/dist/ssr";

/** Form-level error: announced to screen readers, names the problem and the way out. */
export function FormAlert({ message }: { message: string | null }) {
  return (
    <div aria-live="assertive" className="empty:hidden">
      {message && (
        <p role="alert" className="flex items-start gap-2.5 rounded-field bg-chip px-4 py-3 text-base font-semibold text-alert">
          <WarningCircle size={20} weight="bold" className="mt-px shrink-0" aria-hidden="true" />
          {message}
        </p>
      )}
    </div>
  );
}
