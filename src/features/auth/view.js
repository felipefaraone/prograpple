// Sign-in view: email + magic link, with an explicit "check your email" state.
// The caller supplies onSendLink(email) => Promise<{error}>.

import { el, mount } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';

// Every status/error line goes through here, so an error object can never reach
// the DOM. A Supabase AuthError's fields are non-enumerable, so putting the object
// in the DOM serialises to "{}" (and String() gives "[object Object]") — this
// returns a plain string only: the message when it is a usable string, a generic
// fallback for a real error without one, and "" (render nothing) when there is no
// error at all.
function statusMessage(err) {
  if (!err) return '';
  const msg = typeof err === 'string' ? err : err.message;
  return typeof msg === 'string' && msg.trim()
    ? msg
    : 'Something went wrong, try again.';
}

export function renderSignIn({ onSendLink }) {
  const container = el('div', { class: 'signin' });

  function showForm(prefill = '') {
    const emailInput = el('input', {
      class: 'input',
      type: 'email',
      name: 'email',
      placeholder: 'you@gym.com',
      autocomplete: 'email',
      required: 'required',
      value: prefill,
    });
    const error = el('div', { class: 'notice error', hidden: 'hidden' });
    const submit = el(
      'button',
      { class: 'btn primary', type: 'submit' },
      icon('mail'),
      'Send magic link'
    );

    // The single writer of the status line: always a string, hidden when empty.
    const setStatus = (text) => {
      error.textContent = text;
      error.hidden = !text;
    };
    const resetSubmit = () => {
      submit.disabled = false;
      mount(submit, icon('mail'));
      submit.append('Send magic link');
    };

    const form = el(
      'form',
      {
        onsubmit: async (event) => {
          event.preventDefault();
          const email = emailInput.value.trim();
          if (!email) return; // nothing to send, nothing to show
          setStatus('');
          submit.disabled = true;
          submit.textContent = 'Sending…';
          // onSendLink may resolve to { error } or reject outright; treat both the
          // same and only ever show a string.
          let sendError;
          try {
            ({ error: sendError } = await onSendLink(email));
          } catch (thrown) {
            sendError = thrown;
          }
          if (sendError) {
            setStatus(statusMessage(sendError));
            resetSubmit();
            return;
          }
          showSent(email);
        },
      },
      el(
        'div',
        { class: 'field' },
        el('label', { for: 'email', text: 'Email' }),
        emailInput
      ),
      error,
      submit
    );

    mount(
      container,
      card(
        el('div', {
          class: 'signin-lead',
          text: 'Sign in with a magic link. No password needed.',
        }),
        form
      )
    );
    emailInput.focus();
  }

  function showSent(email) {
    mount(
      container,
      card(
        el(
          'div',
          { class: 'signin-sent' },
          el('span', { class: 'mark' }, icon('mail', { size: 20 })),
          el('div', { class: 'signin-brand', text: 'Check your email' }),
          el(
            'div',
            { class: 'muted' },
            'We sent a magic link to ',
            el('span', { class: 'to', text: email }),
            '. Open it on this device to finish signing in.'
          ),
          el(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              onclick: () => showForm(email),
            },
            'Use a different email'
          )
        )
      )
    );
  }

  function card(...children) {
    return el(
      'div',
      { class: 'signin-card' },
      el('div', { class: 'signin-brand', text: 'ProGrapple' }),
      ...children
    );
  }

  showForm();
  return container;
}
