// The eight composite quick-tags (ARCHITECTURE §5.3, decision T25).
//
// T25: a FRONTEND CONSTANT, not a database table. Each entry references
// (category, term, result) — never a hardcoded UUID, because the seed generates
// different ids per environment. Ids are resolved against the in-memory taxonomy
// at load time, and if any term fails to resolve we fail loudly (below) rather
// than render a dead button.
//
// Derived from the prototype's QUICK_DEFAULTS, remapped onto the split taxonomy
// (§5.2 dissolved `pts`): the scored technique defaults target the generic
// "(unspecified)" terms so the fast path never forces a mid-roll "which pass was
// it?" choice; already-atomic entries (Guard Pull, Mount, Scramble) stay specific.
//
//   key  prototype default        writes (category, term, result)
//   1    td:Guard Pull            takedown  / Guard Pull                 / null
//   2    pts:Guard Pass (3)       pass      / Pass (unspecified)         / scored
//   3    pts:Sweep (2)            sweep     / Sweep (unspecified)        / scored
//   4    back:Back Take           back      / Back Attack (unspecified)  / scored
//   5    sub:Armbar               submission/ Submission (unspecified)   / attempted
//   6    pos:Mount                position  / Mount                      / scored
//   7    pts:Submission (finish)  submission/ Submission (unspecified)   / scored
//   8    pts:Scramble             event     / Scramble                   / null

import { resolveTerm } from './taxonomy.js';

export const QUICK_TAGS = [
  {
    key: '1',
    label: 'Guard pull',
    category: 'takedown',
    term: 'Guard Pull',
    result: null,
  },
  {
    key: '2',
    label: 'Pass',
    category: 'pass',
    term: 'Pass (unspecified)',
    result: 'scored',
  },
  {
    key: '3',
    label: 'Sweep',
    category: 'sweep',
    term: 'Sweep (unspecified)',
    result: 'scored',
  },
  {
    key: '4',
    label: 'Back take',
    category: 'back',
    term: 'Back Attack (unspecified)',
    result: 'scored',
  },
  {
    key: '5',
    label: 'Sub attempt',
    category: 'submission',
    term: 'Submission (unspecified)',
    result: 'attempted',
  },
  {
    key: '6',
    label: 'Mount',
    category: 'position',
    term: 'Mount',
    result: 'scored',
  },
  {
    key: '7',
    label: 'Sub finish',
    category: 'submission',
    term: 'Submission (unspecified)',
    result: 'scored',
  },
  {
    key: '8',
    label: 'Scramble',
    category: 'event',
    term: 'Scramble',
    result: null,
  },
];

let resolved = null;

// Resolve every quick-tag to its taxonomy_id against the loaded taxonomy. Throws
// with the full list of failures if any term is missing — a loud, developer-facing
// error at load, never a silently dead button (§5.3). Memoised after first success.
export function resolveQuickTags() {
  if (resolved) return resolved;

  const out = [];
  const failures = [];
  for (const q of QUICK_TAGS) {
    const row = resolveTerm(q.category, q.term);
    if (!row) {
      failures.push(`${q.key}: (${q.category}, "${q.term}")`);
      continue;
    }
    out.push({ ...q, taxonomyId: row.id });
  }
  if (failures.length) {
    throw new Error(
      `Quick-tags failed to resolve against the taxonomy. The seed and this ` +
        `constant disagree. Fix the seed or the constant:\n  ${failures.join('\n  ')}`
    );
  }
  resolved = out;
  return resolved;
}
