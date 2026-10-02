import { useNavigate } from '@solidjs/router';
import {
  type AuthFieldSpec,
  AuthFormView,
  AuthPage,
} from '../components/auth-form';
import { authClient } from '../lib/auth-client';
import { useAuthForm } from '../lib/auth-form';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELDS: readonly AuthFieldSpec[] = [
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'password', label: 'Password', type: 'password' },
];

interface Credentials {
  email: string;
  password: string;
}

const validateCredentials = (values: Credentials) => {
  const errors: Partial<Record<keyof Credentials, string>> = {};

  if (values.email.trim() === '') {
    errors.email = 'Email is required.';
  } else if (!EMAIL_REGEX.test(values.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (values.password === '') {
    errors.password = 'Password is required.';
  }

  return errors;
};

const Login = () => {
  const navigate = useNavigate();
  const auth = useAuthForm<Credentials>({
    initial: { email: '', password: '' },
    validate: validateCredentials,
    fallbackError: 'Sign in failed. Please try again.',
    onValid: async (values) => {
      const { error } = await authClient.signIn.email({
        email: values.email.trim(),
        password: values.password,
      });

      if (error) {
        throw new Error(error.message ?? 'Sign in failed.');
      }

      navigate('/');
    },
  });

  return (
    <AuthPage title="Sign in">
      <AuthFormView
        auth={auth}
        fields={FIELDS}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
      />
      <p class="text-center text-xs text-[#5e6662]">
        Don&apos;t have an account?{' '}
        <a
          href="/register"
          class="link font-semibold text-[#0f764a] hover:text-[#0c623d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f764a] focus-visible:ring-offset-2 rounded"
        >
          Create one
        </a>
      </p>
    </AuthPage>
  );
};

export default Login;
