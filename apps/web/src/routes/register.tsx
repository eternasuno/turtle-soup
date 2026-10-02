import { useNavigate } from '@solidjs/router';
import {
  type AuthFieldSpec,
  AuthFormView,
  AuthPage,
} from '../components/auth-form';
import { authClient } from '../lib/auth-client';
import { useAuthForm } from '../lib/auth-form';

const MIN_PASSWORD_LENGTH = 8;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELDS: readonly AuthFieldSpec[] = [
  { id: 'name', label: 'Name', type: 'text' },
  { id: 'email', label: 'Email', type: 'email' },
  { id: 'password', label: 'Password', type: 'password' },
  { id: 'confirm', label: 'Confirm password', type: 'password' },
];

interface NewAccount {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

const validateNewAccount = (values: NewAccount) => {
  const errors: Partial<Record<keyof NewAccount, string>> = {};

  if (values.name.trim() === '') {
    errors.name = 'Name is required.';
  }

  if (values.email.trim() === '') {
    errors.email = 'Email is required.';
  } else if (!EMAIL_REGEX.test(values.email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (values.password !== values.confirm) {
    errors.confirm = 'Passwords do not match.';
  }

  return errors;
};

const Register = () => {
  const navigate = useNavigate();
  const auth = useAuthForm<NewAccount>({
    initial: { name: '', email: '', password: '', confirm: '' },
    validate: validateNewAccount,
    fallbackError: 'Registration failed. Please try again.',
    onValid: async (values) => {
      const { error } = await authClient.signUp.email({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });

      if (error) {
        throw new Error(error.message ?? 'Registration failed.');
      }

      navigate('/login');
    },
  });

  return (
    <AuthPage title="Create an account">
      <AuthFormView
        auth={auth}
        fields={FIELDS}
        submitLabel="Create account"
        pendingLabel="Creating account…"
      />
      <p class="text-center text-xs text-[#5e6662]">
        Already have an account?{' '}
        <a
          href="/login"
          class="link font-semibold text-[#0f764a] hover:text-[#0c623d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f764a] focus-visible:ring-offset-2 rounded"
        >
          Sign in
        </a>
      </p>
    </AuthPage>
  );
};

export default Register;
