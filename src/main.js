import './lib/sentry.js';
import './ui/tokens.css';
import './ui/app.css';
import './ui/lists.css';
import './ui/video.css';
import './ui/tagging.css';

import { supabase } from './lib/supabase.js';
import { el, mount } from './ui/dom.js';
import { renderSignIn } from './features/auth/view.js';
import { renderShell } from './ui/shell.js';
import { renderAthletes } from './features/athletes/view.js';
import { renderVideoRoom } from './features/video-room/view.js';
import { loadTaxonomy } from './features/tagging/taxonomy.js';
import { resolveQuickTags } from './features/tagging/quick-tags.js';
import { getActiveOrgId, clearOrgCache } from './lib/org.js';
import { lastVideo } from './lib/last-video.js';

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

  // Load the taxonomy once on app load (§5.4), then resolve the quick-tags
  // against it — failing loudly here if the seed and the constant disagree (§5.3),
  // so the error is seen at load rather than as a dead button later.
  const { error: taxError } = await loadTaxonomy(supabase);
  if (taxError) console.error('[taxonomy] failed to load:', taxError.message);
  try {
    resolveQuickTags();
  } catch (quickErr) {
    console.error('[quick-tags]', quickErr.message);
  }

  // Sidebar collapse state, remembered for the session. Entering the video room
  // auto-collapses and leaving auto-expands — until the coach toggles manually,
  // after which their choice wins for the rest of the session (do not fight them).
  let collapsed = false;
  let userOverrode = false;
  let shell;
  const autoSidebar = (wantCollapsed) => {
    if (userOverrode) return;
    collapsed = wantCollapsed;
    shell.setCollapsed(collapsed);
  };

  // The single navigate-to-Videos action, reused by the Videos nav item and by the
  // logo (FIX 6) — one path, no new routing.
  const goVideos = () =>
    renderVideoRoom(shell.content, {
      client: supabase,
      orgId,
      setSidebar: autoSidebar,
    });

  // Athletes first — it is the central object of the data model (nav order + default).
  shell = renderShell({
    email: session.user.email,
    onSignOut,
    onToggle: () => {
      userOverrode = true;
      collapsed = !collapsed;
      shell.setCollapsed(collapsed);
    },
    // Clicking the logo goes home = the Videos list (same destination as the Videos
    // nav), highlighting that nav item.
    onLogo: () => {
      shell.setActive('videos');
      goVideos();
    },
    nav: [
      {
        id: 'athletes',
        label: 'Athletes',
        iconName: 'users',
        onSelect: () => {
          autoSidebar(false);
          renderAthletes(shell.content, { client: supabase, orgId });
        },
      },
      {
        id: 'videos',
        label: 'Videos',
        iconName: 'video',
        onSelect: goVideos,
      },
    ],
  });
  mount(appRoot, shell.root);

  // Landing surface: if a video was open before a reload, restore it (FIX 2) — the
  // video room validates the id against the active list and falls back to the list
  // cleanly if it is stale/archived/deleted. Otherwise land on Athletes (default).
  const restoreVideoId = lastVideo();
  if (restoreVideoId) {
    shell.setActive('videos');
    renderVideoRoom(shell.content, {
      client: supabase,
      orgId,
      setSidebar: autoSidebar,
      openVideoId: restoreVideoId,
    });
  } else {
    shell.setActive('athletes');
    renderAthletes(shell.content, { client: supabase, orgId });
  }
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
