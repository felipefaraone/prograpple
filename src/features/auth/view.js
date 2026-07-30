// Sign-in view: email + magic link, with an explicit "check your email" state.
// The caller supplies onSendLink(email) => Promise<{error}>.

import { el, mount } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';

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

    const form = el(
      'form',
      {
        onsubmit: async (event) => {
          event.preventDefault();
          const email = emailInput.value.trim();
          if (!email) return;
          error.hidden = true;
          submit.disabled = true;
          submit.textContent = 'Sending…';
          const { error: sendError } = await onSendLink(email);
          if (sendError) {
            error.textContent = sendError.message || 'Could not send the link.';
            error.hidden = false;
            submit.disabled = false;
            mount(submit, icon('mail'));
            submit.append('Send magic link');
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
