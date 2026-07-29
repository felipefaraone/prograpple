import * as Sentry from '@sentry/browser';

// DSN comes from the environment. When it is absent — as in local dev — Sentry
// is never initialised, so nothing is sent and the console stays quiet. This is
// a deliberate silent no-op, not an error.
const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
  });
}
