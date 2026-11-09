// Loads Crisis's data files in the browser. Tests read the same files from disk.
export async function loadCrisisData() {
  const [rules, crises, map] = await Promise.all(
    ['data/rules.json', 'data/crises.json', 'data/map.json'].map((url) => fetch(url).then((r) => r.json())),
  );
  return { rules, cards: crises.cards, regions: map.regions, map };
}
