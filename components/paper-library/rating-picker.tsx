import { RATING_OPTIONS, getRatingSelectClasses } from "./paper-ui";

type RatingPickerProps = {
  value?: string | null;
  disabled?: boolean;
  label: string;
  onChange: (rating: string) => void;
};

export function RatingPicker({
  value,
  disabled,
  label,
  onChange,
}: RatingPickerProps) {
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      className={`min-h-10 rounded-md border px-3 pr-8 text-sm font-medium outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-teal-950 ${getRatingSelectClasses(
        value,
      )}`}
    >
      {RATING_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
