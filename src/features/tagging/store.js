// In-memory tag store — the single source consulted when rendering the timeline
// (CONVENTIONS §9). Seeded from the database on open (fetchTagsForVideo), then
// mutated optimistically on every drop/delete before the network is touched.
// Kept sorted by (timestamp_seconds, id) so prev/next seeks and render order are
// total and stable.

function compare(a, b) {
  if (a.timestamp_seconds !== b.timestamp_seconds) {
    return a.timestamp_seconds - b.timestamp_seconds;
  }
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function createTagStore() {
  let tags = [];

  return {
    set(list) {
      tags = [...list].sort(compare);
    },
    add(tag) {
      // Insertion sort keeps the array ordered without re-sorting the whole list.
      let i = tags.length;
      while (i > 0 && compare(tags[i - 1], tag) > 0) i--;
      tags.splice(i, 0, tag);
    },
    remove(id) {
      tags = tags.filter((t) => t.id !== id);
    },
    getAll() {
      return tags;
    },
    // Largest timestamp strictly before `time` (for the "[" previous-tag seek).
    prevBefore(time) {
      let found = null;
      for (const t of tags) {
        if (t.timestamp_seconds < time - 1e-4) found = t;
        else break;
      }
      return found;
    },
    // Smallest timestamp strictly after `time` (for the "]" next-tag seek).
    nextAfter(time) {
      for (const t of tags) {
        if (t.timestamp_seconds > time + 1e-4) return t;
      }
      return null;
    },
  };
}
