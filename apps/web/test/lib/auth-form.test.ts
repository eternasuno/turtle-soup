import { expect, it, vi } from 'vitest';
import { useAuthForm } from '../../src/lib/auth-form';

interface Credentials {
  email: string;
  password: string;
}

const validateCredentials = (values: Credentials) => {
  const errors: Partial<Record<keyof Credentials, string>> = {};

  if (values.email.trim() === '') {
    errors.email = 'Email is required.';
  }

  if (values.password === '') {
    errors.password = 'Password is required.';
  }

  return errors;
};

const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as Event;

it('clears only the edited field error and submits once all fields are valid', async () => {
  const onValid = vi.fn(async () => {});
  const auth = useAuthForm<Credentials>({
    initial: { email: '', password: '' },
    validate: validateCredentials,
    fallbackError: 'Sign in failed.',
    onValid,
  });

  await auth.handleSubmit(submitEvent());

  expect(auth.fieldErrors()).toEqual({
    email: 'Email is required.',
    password: 'Password is required.',
  });

  auth.updateField('email', 'user@example.com');

  expect(auth.fieldErrors()).toEqual({
    password: 'Password is required.',
  });

  auth.updateField('password', 'correct horse battery staple');
  expect(auth.fieldErrors()).toEqual({});

  const event = submitEvent();
  await auth.handleSubmit(event);

  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(onValid).toHaveBeenCalledOnce();
  expect(auth.form()).toEqual({
    email: 'user@example.com',
    password: 'correct horse battery staple',
  });
});
