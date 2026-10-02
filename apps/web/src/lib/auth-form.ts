import { type Accessor, createSignal, type Setter } from 'solid-js';

export type FieldErrors<T extends { [K in keyof T]: string }> = Partial<
  Record<keyof T, string>
>;

export interface AuthForm<T extends { [K in keyof T]: string }> {
  form: Accessor<T>;
  fieldErrors: Accessor<FieldErrors<T>>;
  formError: Accessor<string>;
  submitting: Accessor<boolean>;
  updateField: (field: keyof T, value: string) => void;
  handleSubmit: (event: Event) => Promise<void>;
}

interface AuthFormOptions<T extends { [K in keyof T]: string }> {
  initial: T;
  validate: (values: T) => FieldErrors<T>;
  fallbackError: string;
  onValid: (values: T) => Promise<void>;
}

const objectSignal = <T extends object>(initial: T) =>
  createSignal(initial as object) as unknown as [Accessor<T>, Setter<T>];

export const useAuthForm = <T extends { [K in keyof T]: string }>(
  options: AuthFormOptions<T>
): AuthForm<T> => {
  const [form, setForm] = objectSignal(options.initial);
  const [fieldErrors, setFieldErrors] = objectSignal({} as FieldErrors<T>);
  const [formError, setFormError] = createSignal('');
  const [submitting, setSubmitting] = createSignal(false);

  const updateField = (field: keyof T, value: string) => {
    setForm((current) => ({ ...current, [field]: value }) as T);
    setFieldErrors((current) => {
      const { [field]: _fieldError, ...remainingErrors } = current;

      return remainingErrors as FieldErrors<T>;
    });
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    setFormError('');
    const errors = options.validate(form());
    setFieldErrors(() => errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);

    try {
      await options.onValid(form());
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setFormError(message || options.fallbackError);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    form,
    fieldErrors,
    formError,
    submitting,
    updateField,
    handleSubmit,
  };
};
