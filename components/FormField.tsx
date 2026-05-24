type FormFieldProps = {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
};

const inputClasses =
  "mt-2 w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-3 text-orbi-text outline-none transition placeholder:text-orbi-muted/55 focus:border-orbi-cyan/60 focus:bg-white/[0.07] focus:ring-2 focus:ring-orbi-cyan/15";

export function FormField({
  label,
  name,
  type = "text",
  placeholder,
  required = true,
  textarea
}: FormFieldProps) {
  return (
    <label className="block text-sm font-semibold text-orbi-text">
      {label}
      {textarea ? (
        <textarea
          className={`${inputClasses} min-h-28 resize-y`}
          name={name}
          placeholder={placeholder}
          required={required}
        />
      ) : (
        <input
          className={inputClasses}
          name={name}
          type={type}
          placeholder={placeholder}
          required={required}
        />
      )}
    </label>
  );
}
