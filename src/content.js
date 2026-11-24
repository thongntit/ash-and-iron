export const CLASSES = {
  warden: {
    name: 'Warden', mark: '⚔', role: 'Vanguard', color: '#d7aa6d', health: 136, damage: 25, reach: 1.55,
    description: 'An ironclad sentinel who breaks enemy lines at close range.',
    attack: 'Iron Cleave', art: 'Cinder Sweep', artTip: 'Scorch every foe around you.', cost: 30,
  },
  witch: {
    name: 'Ember Witch', mark: '✷', role: 'Spellcaster', color: '#f49b72', health: 92, damage: 22, reach: 6.7,
    description: 'A wandering firekeeper who burns down threats from a distance.',
    attack: 'Ember Bolt', art: 'Pyre Bloom', artTip: 'Erupt the ground under your cursor.', cost: 35,
  },
  scout: {
    name: 'Hollow Scout', mark: '➶', role: 'Skirmisher', color: '#98bba2', health: 108, damage: 23, reach: 7.6,
    description: 'A patient marksman whose arrows pierce clustered foes.',
    attack: 'Thorn Arrow', art: 'Briar Volley', artTip: 'Send three piercing arrows toward your cursor.', cost: 28,
  },
};

export const QUESTS = [
  ['The Watch at dusk', 'Speak with Keeper Mara', 'The keeper waits beside the brazier at Gloamwatch.'],
  ['A road of cinders', 'Recover the Ash Seal', 'Clear the raiders around the ruined shrine in Cinderwood.'],
  ['A debt beneath stone', 'Recover the Iron Seal', 'Descend into the Reliquary and defeat the Reliquary Knight.'],
  ['The last toll', 'Silence the Bellworn', 'Enter Ashen Belfry and destroy what is bound to the bell.'],
  ['A quieter dawn', 'Return to Keeper Mara', 'Use the waygate to return to Gloamwatch with word of the Bellworn.'],
  ['Act I complete', 'The bell is silent', 'Gloamwatch will see another dawn. Explore freely or return to the title.'],
];

export const ASH_SEAL = 'ashSeal';
export const IRON_SEAL = 'ironSeal';

const gate = (id, x, y, dest, arrival, label) => ({ kind: 'gate', id, x, y, dest, arrival, label });
const npc = (kind, x, y, label) => ({ kind, id: kind, x, y, label });
const enemy = (type, x, y, name) => ({ type, x, y, name });

export const ZONES = {
  watch: {
    name: 'Gloamwatch', subtitle: 'The last lantern on the road', theme: 'watch', size: 23, seed: 7,
    spawn: [10, 12], safe: true, paths: [[[3, 13], [10, 12], [17, 12], [21, 7]], [[10, 12], [10, 5]], [[15, 12], [16, 17]]],
    markers: [npc('keeper', 10, 9, 'Keeper Mara'), npc('smith', 15, 12, 'Smith Oren'), npc('shrine', 16, 17, 'Rest Shrine'), gate('wood', 21, 7, 'wood', [4, 16], 'To Cinderwood')],
    props: [['house', 5, 8], ['house', 14, 7], ['tent', 17, 10], ['house', 6, 16], ['brazier', 9, 10], ['brazier', 12, 9], ['brazier', 19, 8], ['wall', 4, 6]],
    enemies: [],
  },
  wood: {
    name: 'Cinderwood', subtitle: 'The pines still remember the fire', theme: 'wood', size: 29, seed: 306,
    spawn: [4, 16], paths: [[[2, 16], [8, 16], [12, 12], [19, 11], [26, 5]], [[12, 12], [16, 20], [24, 22]], [[8, 16], [7, 23]]],
    markers: [gate('watch', 2, 16, 'watch', [19, 8], 'To Gloamwatch'), npc(ASH_SEAL, 24, 22, 'Ash Seal'), gate('crypt', 26, 5, 'crypt', [4, 17], 'To the Reliquary')],
    props: [['brazier', 23, 21], ['brazier', 25, 21], ['altar', 24, 23], ['wall', 11, 9], ['wall', 17, 17], ['wall', 22, 23], ['wall', 24, 6]],
    enemies: [
      enemy('thrall', 8, 15), enemy('thrall', 9, 17), enemy('husk', 11, 13), enemy('archer', 13, 11), enemy('thrall', 14, 12), enemy('husk', 17, 9), enemy('archer', 20, 11), enemy('thrall', 19, 12),
      enemy('husk', 15, 17), enemy('thrall', 18, 20), enemy('archer', 20, 21), enemy('thrall', 22, 22), enemy('brute', 24, 21, 'Shrine Reaver'),
      enemy('thrall', 7, 22), enemy('husk', 6, 24), enemy('archer', 25, 8),
    ],
  },
  crypt: {
    name: 'The Reliquary', subtitle: 'Where iron is given its dead', theme: 'crypt', size: 27, seed: 812,
    spawn: [4, 17], paths: [[[2, 17], [8, 17], [8, 10], [17, 10], [17, 5], [24, 5]], [[17, 10], [17, 18], [23, 18]], [[8, 17], [11, 22]]],
    markers: [gate('wood', 2, 17, 'wood', [24, 6], 'To Cinderwood'), npc(IRON_SEAL, 23, 18, 'Iron Seal'), gate('belfry', 24, 5, 'belfry', [4, 14], 'To Ashen Belfry')],
    props: [['brazier', 8, 13], ['brazier', 12, 9], ['brazier', 16, 15], ['brazier', 22, 17], ['altar', 24, 19], ['wall', 19, 20], ['wall', 13, 12], ['wall', 23, 6]],
    enemies: [
      enemy('husk', 7, 16), enemy('husk', 9, 15), enemy('archer', 8, 11), enemy('wisp', 11, 10), enemy('husk', 13, 11), enemy('brute', 16, 9), enemy('archer', 18, 7),
      enemy('wisp', 18, 13), enemy('husk', 17, 16), enemy('archer', 20, 18), enemy('wisp', 21, 19), enemy('knight', 23, 17, 'Reliquary Knight'),
      enemy('brute', 11, 22), enemy('wisp', 22, 5), enemy('husk', 24, 7),
    ],
  },
  belfry: {
    name: 'Ashen Belfry', subtitle: 'The bell calls down the dark', theme: 'belfry', size: 25, seed: 492,
    spawn: [4, 14], paths: [[[2, 14], [8, 14], [12, 12], [18, 12], [21, 12]]],
    markers: [gate('crypt', 2, 14, 'crypt', [22, 5], 'To the Reliquary'), gate('home', 21, 16, 'watch', [10, 11], 'Waygate to Gloamwatch')],
    props: [['brazier', 17, 8], ['brazier', 17, 16], ['brazier', 22, 8], ['bell', 23, 11], ['wall', 11, 9], ['wall', 11, 16], ['altar', 23, 16]],
    enemies: [
      enemy('husk', 8, 14), enemy('wisp', 9, 12), enemy('brute', 12, 12), enemy('archer', 13, 14), enemy('knight', 15, 10), enemy('wisp', 15, 15), enemy('boss', 21, 12, 'The Bellworn'),
    ],
  },
};

export const ENEMIES = {
  thrall: { name: 'Ash Thrall', hp: 43, speed: 2.05, damage: 12, radius: 0.34, xp: 25, gold: 8, color: '#8d6754' },
  husk: { name: 'Hollow Husk', hp: 62, speed: 1.75, damage: 15, radius: 0.4, xp: 36, gold: 12, color: '#ad9b7d' },
  archer: { name: 'Cinder Archer', hp: 46, speed: 1.8, damage: 12, radius: 0.34, xp: 33, gold: 10, color: '#828e74', ranged: true },
  wisp: { name: 'Grave Wisp', hp: 55, speed: 2.3, damage: 14, radius: 0.35, xp: 40, gold: 14, color: '#90cdca', ranged: true },
  brute: { name: 'Furnace Brute', hp: 134, speed: 1.38, damage: 23, radius: 0.57, xp: 70, gold: 26, color: '#a76c53' },
  knight: { name: 'Votive Knight', hp: 205, speed: 1.55, damage: 28, radius: 0.62, xp: 110, gold: 39, color: '#8d8eae' },
  boss: { name: 'The Bellworn', hp: 740, speed: 1.72, damage: 34, radius: 0.8, xp: 320, gold: 110, color: '#d89150' },
};

export const TIERS = ['Common', 'Uncommon', 'Rare', 'Relic'];
export const SLOTS = ['weapon', 'armor', 'charm'];
const ITEM_NAMES = {
  weapon: ['Militia Iron', 'Cinderbrand', 'Votive Edge', 'Dawnforged Arm'],
  armor: ['Patchwork Coat', 'Watcher’s Plate', 'Graveweave Mantle', 'Ironwake Vestment'],
  charm: ['Charred Locket', 'Ashglass Talisman', 'Relic of Vigil', 'Last Light'],
};

export function makeItem(slot, tier, rank, id) {
  const power = Math.max(1, rank) + tier * 3 + 2;
  return {
    id, slot, tier, name: ITEM_NAMES[slot][tier],
    damage: slot === 'weapon' ? power : slot === 'charm' ? Math.ceil(power / 2) : 0,
    health: slot === 'armor' ? 5 * power : slot === 'charm' ? 2 * power : 0,
    defense: slot === 'armor' ? Math.ceil(power / 2) : 0,
    value: 5 + power * 2,
  };
}
