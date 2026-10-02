import { useNavigate } from '@solidjs/router';
import { createSignal, createTrackedEffect, onCleanup, Show } from 'solid-js';
import { FormError } from '../components/auth-form';
import { authClient } from '../lib/auth-client';

type SessionState = ReturnType<(typeof authClient.useSession)['get']>;

const Spinner = () => (
  <div
    class="flex flex-col items-center justify-center gap-3 p-8"
    role="status"
  >
    <div class="loading loading-spinner loading-lg text-[#0f764a]" />
    <span class="sr-only">Loading session</span>
    <p class="text-xs font-medium tracking-wide text-[#5e6662] uppercase">
      Loading workspace…
    </p>
  </div>
);

const useLogout = () => {
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = createSignal(false);
  const [logoutError, setLogoutError] = createSignal('');

  const logout = async () => {
    setLogoutError('');
    setLoggingOut(true);

    try {
      const { error } = await authClient.signOut();

      if (error) {
        setLogoutError(error.message ?? 'Sign out failed.');

        return;
      }

      navigate('/login');
    } catch {
      setLogoutError('Sign out failed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  return { logout, loggingOut, logoutError };
};

interface SessionCardProps {
  session: SessionState;
  loggingOut: boolean;
  logoutError: string;
  onLogout: () => void;
}

const SessionCard = (props: SessionCardProps) => (
  <div class="card card-border w-full max-w-2xl overflow-hidden rounded-2xl border border-[#e6dfd3] bg-[#ffffff] shadow-[0_20px_45px_-15px_rgba(20,25,23,0.07)]">
    <div class="card-body p-6 sm:p-8 md:p-10 space-y-6">
      <Show when={props.session.data}>
        {(data) => (
          <>
            <div class="flex flex-col gap-4 border-b border-[#e6dfd3] pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex items-center gap-4">
                <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f764a]/10 text-xl font-bold text-[#0f764a] border border-[#a4ddbe]/40">
                  {data().user.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h1 class="card-title text-2xl font-bold tracking-tight text-[#141917]">
                    Welcome, {data().user.name}
                  </h1>
                  <p class="text-xs font-medium tracking-wide text-[#5e6662]">
                    Active account overview
                  </p>
                </div>
              </div>

              <div class="inline-flex items-center gap-1.5 self-start rounded-full border border-[#9dd8b7] bg-[#eaf6ef] px-3 py-1 text-xs font-semibold text-[#0f764a] sm:self-center">
                <span class="h-2 w-2 rounded-full bg-[#0f764a]" />
                <span>Signed in</span>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div class="rounded-xl border border-[#e6dfd3] bg-[#faf8f5] p-4">
                <p class="text-xs font-semibold tracking-wider text-[#5e6662] uppercase">
                  Name
                </p>
                <p class="mt-1 text-sm font-semibold text-[#141917]">
                  {data().user.name}
                </p>
              </div>

              <div class="rounded-xl border border-[#e6dfd3] bg-[#faf8f5] p-4">
                <p class="text-xs font-semibold tracking-wider text-[#5e6662] uppercase">
                  Email Address
                </p>
                <p class="mt-1 text-sm font-semibold text-[#141917] truncate">
                  {data().user.email}
                </p>
              </div>

              <div class="rounded-xl border border-[#e6dfd3] bg-[#faf8f5] p-4">
                <p class="text-xs font-semibold tracking-wider text-[#5e6662] uppercase">
                  Account Status
                </p>
                <p class="mt-1 flex items-center gap-1.5 text-sm font-semibold text-[#0f764a]">
                  <span class="inline-block h-1.5 w-1.5 rounded-full bg-[#0f764a]" />
                  Active
                </p>
              </div>

              <div class="rounded-xl border border-[#e6dfd3] bg-[#faf8f5] p-4">
                <p class="text-xs font-semibold tracking-wider text-[#5e6662] uppercase">
                  Architecture
                </p>
                <p class="mt-1 text-sm font-semibold text-[#141917]">
                  SolidJS + SurrealKV + Effect
                </p>
              </div>
            </div>

            <FormError message={props.logoutError} />

            <div class="card-actions flex items-center justify-between border-t border-[#e6dfd3] pt-6">
              <span class="text-xs text-[#5e6662]">Your account is ready</span>
              <button
                type="button"
                class="btn btn-outline inline-flex h-10 items-center justify-center rounded-lg border border-[#e6dfd3] bg-transparent px-4 text-xs font-semibold tracking-wider text-[#141917] uppercase transition hover:border-[#b91c1c] hover:bg-[#fef2f2] hover:text-[#b91c1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b91c1c] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={props.onLogout}
                disabled={props.loggingOut}
                aria-busy={props.loggingOut ? 'true' : 'false'}
              >
                <Show when={props.loggingOut}>
                  <svg
                    class="mr-2 h-3.5 w-3.5 animate-spin"
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
                <span>{props.loggingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          </>
        )}
      </Show>
    </div>
  </div>
);

const SessionErrorCard = (props: { session: SessionState }) => (
  <div class="card card-border w-full max-w-md overflow-hidden rounded-2xl border border-[#fca5a5] bg-[#ffffff] p-6 shadow-[0_20px_45px_-15px_rgba(20,25,23,0.07)] sm:p-8">
    <div class="card-body p-0 space-y-4">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fef2f2] text-[#b91c1c]">
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <div>
          <h1 class="card-title text-lg font-bold text-[#b91c1c]">
            Unable to load your session
          </h1>
          <p class="text-xs text-[#5e6662]">
            There was a problem authenticating your current state.
          </p>
        </div>
      </div>

      <FormError
        message={props.session.error?.message ?? 'Failed to load your session.'}
      />

      <div class="card-actions flex justify-end pt-2">
        <button
          type="button"
          class="btn btn-primary inline-flex h-10 items-center justify-center rounded-lg border-0 bg-[#0f764a] px-4 text-xs font-semibold tracking-wider text-white uppercase transition hover:bg-[#0c623d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f764a] focus-visible:ring-offset-2"
          onClick={() => void props.session.refetch()}
        >
          Try again
        </button>
      </div>
    </div>
  </div>
);

const Home = () => {
  const navigate = useNavigate();
  const [session, setSession] = createSignal<SessionState>(
    authClient.useSession.get()
  );
  const { logout, loggingOut, logoutError } = useLogout();

  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  onCleanup(() => {
    disposed = true;
    unsubscribe?.();
  });

  queueMicrotask(() => {
    if (!disposed) {
      unsubscribe = authClient.useSession.subscribe(setSession);
    }
  });

  createTrackedEffect(() => {
    const current = session();

    if (!current.isPending && !current.data && !current.error) {
      navigate('/login', { replace: true });
    }
  });

  return (
    <main class="relative flex min-h-screen w-full items-center justify-center bg-[#faf8f5] px-4 py-8 sm:px-6 lg:px-8">
      <Show when={!session().isPending} fallback={<Spinner />}>
        <Show
          when={!session().error}
          fallback={<SessionErrorCard session={session()} />}
        >
          <SessionCard
            session={session()}
            loggingOut={loggingOut()}
            logoutError={logoutError()}
            onLogout={() => void logout()}
          />
        </Show>
      </Show>
    </main>
  );
};

export default Home;
