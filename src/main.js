import './lib/sentry.js';
import './ui/tokens.css';
import './ui/app.css';
import './ui/video.css';

import { supabase } from './lib/supabase.js';
import { el, mount } from './ui/dom.js';
import { renderSignIn } from './features/auth/view.js';
import { renderShell } from './ui/shell.js';
import { renderAthletes } from './features/athletes/view.js';
import { renderVideoRoom } from './features/video-room/view.js';
import { getActiveOrgId, clearOrgCache } from './lib/org.js';

const appRoot = document.querySelector('#app');

async function renderApp(session) {
  const onSignOut = async () => {
    clearOrgCache();
    await supabase.auth.signOut();
  };

  // The org comes from the bootstrap trigger via memberships — never provisioned
  // by the client. If it is missing, say so honestly rather than inventing one.
  const { orgId, error } = await getActiveOrgId(supabase);
  if (error || !orgId) {
    const { root, content } = renderShell({
      email: session.user.email,
      onSignOut,
    });
    mount(appRoot, root);
    content.append(
      el('div', {
        class: 'notice error',
        text: 'Could not load your organisation. Try signing out and back in.',
      })
    );
    return;
  }

  const { root, content, setActive } = renderShell({
    email: session.user.email,
    onSignOut,
    nav: [
      {
        id: 'videos',
        label: 'Videos',
        iconName: 'film',
        onSelect: () => renderVideoRoom(content, { client: supabase, orgId }),
      },
      {
        id: 'athletes',
        label: 'Athletes',
        iconName: 'users',
        onSelect: () => renderAthletes(content, { client: supabase, orgId }),
      },
    ],
  });
  mount(appRoot, root);

  // Default landing surface is the Video Room (this slice's focus).
  setActive('videos');
  renderVideoRoom(content, { client: supabase, orgId });
}

function renderAuth() {
  const view = renderSignIn({
    onSendLink: async (email) => {
      // emailRedirectTo must be in supabase/config.toml additional_redirect_urls.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href.split('#')[0] },
      });
      return { error };
    },
  });
  mount(appRoot, view);
}

// A single subscription drives all rendering. onAuthStateChange fires an initial
// event with the persisted session (survives reload via supabase-js storage), so
// there is no separate bootstrap path. Guard on user id so a token refresh does
// not tear down and rebuild the view.
let currentUserId = null;
let initialised = false;

supabase.auth.onAuthStateChange((_event, session) => {
  const userId = session?.user?.id ?? null;
  if (initialised && userId === currentUserId) return;
  initialised = true;
  currentUserId = userId;

  if (session) {
    renderApp(session);
  } else {
    clearOrgCache();
    renderAuth();
  }
});
