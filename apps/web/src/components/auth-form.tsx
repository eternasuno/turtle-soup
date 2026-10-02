import { For, type ParentProps, Show } from 'solid-js';
import type { AuthForm } from '../lib/auth-form';

export interface AuthFieldSpec {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password';
}

interface AuthFormFieldProps {
  id: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  error?: string | undefined;
  required?: boolean;
  onInput: (value: string) => void;
}

export const AuthFormField = (props: AuthFormFieldProps) => {
  const handleInput = (event: InputEvent) => {
    props.onInput((event.currentTarget as HTMLInputElement).value);
  };

  return (
    <fieldset class="fieldset flex flex-col gap-1.5 border-none p-0">
      <label
        class="label flex items-center justify-between p-0 text-xs font-semibold tracking-wide text-[#34403b] uppercase"
        for={props.id}
      >
        <span>{props.label}</span>
      </label>
      <input
        id={props.id}
        type={props.type ?? 'text'}
        class={`input h-11 w-full rounded-lg border bg-[#faf8f5] px-3.5 text-sm font-normal text-[#141917] placeholder-[#89938e] transition duration-150 focus:bg-[#ffffff] focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
          props.error
            ? 'input-error border-[#fca5a5] focus:border-[#b91c1c] focus:ring-[#fca5a5]'
            : 'border-[#e6dfd3] focus:border-[#0f764a] focus:ring-[#0f764a]/20'
        }`}
        value={props.value}
        onInput={handleInput}
        required={props.required}
        aria-required={props.required ? 'true' : undefined}
        aria-invalid={props.error ? 'true' : 'false'}
        aria-describedby={props.error ? `${props.id}-error` : undefined}
      />
      <Show when={props.error}>
        <p
          id={`${props.id}-error`}
          class="label flex items-center gap-1.5 p-0 text-xs font-medium text-[#b91c1c]"
          role="alert"
        >
          <svg
            class="h-3.5 w-3.5 shrink-0"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm-.75-4.25a.75.75 0 0 1 1.5 0 .75.75 0 0 1-1.5 0zM8 4a.75.75 0 0 0-.75.75v4a.75.75 0 0 0 1.5 0v-4A.75.75 0 0 0 8 4z"
              clip-rule="evenodd"
            />
          </svg>
          <span>{props.error}</span>
        </p>
      </Show>
    </fieldset>
  );
};

export const FormError = (props: { message: string }) => (
  <Show when={props.message}>
    <p
      class="alert alert-error flex items-start gap-2.5 rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3.5 py-2.5 text-xs font-medium text-[#991b1b]"
      role="alert"
      aria-live="assertive"
    >
      <svg
        class="mt-0.5 h-4 w-4 shrink-0 text-[#b91c1c]"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fill-rule="evenodd"
          d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm-.75-4.25a.75.75 0 0 1 1.5 0 .75.75 0 0 1-1.5 0zM8 4a.75.75 0 0 0-.75.75v4a.75.75 0 0 0 1.5 0v-4A.75.75 0 0 0 8 4z"
          clip-rule="evenodd"
        />
      </svg>
      <span>{props.message}</span>
    </p>
  </Show>
);

interface AuthFormViewProps<T extends { [K in keyof T]: string }> {
  auth: AuthForm<T>;
  fields: readonly AuthFieldSpec[];
  submitLabel: string;
  pendingLabel: string;
}

export const AuthFormView = <T extends { [K in keyof T]: string }>(
  props: AuthFormViewProps<T>
) => {
  return (
    <form
      onSubmit={props.auth.handleSubmit}
      novalidate
      class="flex flex-col gap-4"
    >
      <For each={props.fields}>
        {(field) => (
          <AuthFormField
            {...field}
            value={props.auth.form()[field.id as keyof T]}
            error={props.auth.fieldErrors()[field.id as keyof T]}
            required
            onInput={(value) =>
              props.auth.updateField(field.id as keyof T, value)
            }
          />
        )}
      </For>
      <FormError message={props.auth.formError()} />
      <button
        type="submit"
        class="btn btn-primary mt-1 inline-flex h-11 w-full items-center justify-center rounded-lg border-0 bg-[#0f764a] px-4 font-medium text-white shadow-sm transition hover:bg-[#0c623d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f764a] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={props.auth.submitting()}
        aria-busy={props.auth.submitting() ? 'true' : 'false'}
      >
        <Show when={props.auth.submitting()}>
          <svg
            class="mr-2 h-4 w-4 animate-spin text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        </Show>
        <span>
          {props.auth.submitting() ? props.pendingLabel : props.submitLabel}
        </span>
      </button>
    </form>
  );
};

export const AuthPage = (props: ParentProps<{ title: string }>) => (
  <main class="relative flex min-h-screen w-full items-center justify-center bg-[#faf8f5] px-4 py-8 sm:px-6 lg:px-8">
    <div class="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-[#e6dfd3] bg-[#ffffff] shadow-[0_20px_45px_-15px_rgba(20,25,23,0.07)] md:grid md:grid-cols-12">
      <section class="flex flex-col justify-between border-b border-[#e6dfd3] bg-[#f4efe6] p-6 sm:p-8 md:col-span-5 md:border-r md:border-b-0 md:p-10">
        <div class="space-y-6">
          <div class="flex items-center gap-2.5">
            <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f764a] text-white shadow-sm">
              <svg
                class="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 2a1 1 0 0 1 .78.375l6 7.5A1 1 0 0 1 16 11.5h-2.5v6A1.5 1.5 0 0 1 12 19H8a1.5 1.5 0 0 1-1.5-1.5v-6H4a1 1 0 0 1-.78-1.625l6-7.5A1 1 0 0 1 10 2z"
                  clip-rule="evenodd"
                />
              </svg>
            </span>
            <span class="text-xs font-bold tracking-widest text-[#141917] uppercase">
              Solid Surreal
            </span>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-semibold tracking-wider text-[#0f764a] uppercase">
              Starter Platform
            </p>
            <h2 class="text-2xl font-semibold tracking-tight text-[#141917] md:text-3xl">
              High-velocity foundation for reactive apps.
            </h2>
            <p class="text-sm leading-relaxed text-[#5e6662]">
              Engineered with pure SolidJS, embedded SurrealKV, and end-to-end
              typed Effect services.
            </p>
          </div>
        </div>

        <div class="mt-8 pt-6 border-t border-[#e6dfd3]/70">
          <div class="flex items-center gap-2 text-xs font-medium text-[#5e6662]">
            <span class="inline-block h-2 w-2 rounded-full bg-[#0f764a]" />
            <span>A thoughtful foundation for your next project</span>
          </div>
        </div>
      </section>

      <section class="flex flex-col justify-center p-6 sm:p-8 md:col-span-7 md:p-10">
        <div class="mx-auto w-full max-w-sm space-y-6">
          <header class="space-y-1">
            <h1 class="card-title text-2xl font-bold tracking-tight text-[#141917]">
              {props.title}
            </h1>
            <p class="text-xs text-[#5e6662]">
              Enter your credentials to access your account workspace.
            </p>
          </header>

          {props.children}
        </div>
      </section>
    </div>
  </main>
);
