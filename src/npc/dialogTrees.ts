import { NPC_IDS } from './NpcIds';
import { NPC_STATE_DEFAULT, NPC_STATE_TALKED_ONCE } from './NpcStateStore';
import type { NpcDialogScriptMap } from './DialogScript';

export const NPC_DIALOG_SCRIPTS: NpcDialogScriptMap = {
  [NPC_IDS.mentor_elara]: {
    roots: {
      [NPC_STATE_DEFAULT]: 'welcome',
      [NPC_STATE_TALKED_ONCE]: 'return_visit',
    },
    nodes: {
      welcome: {
        text:
          "Welcome. I'm Elara. The dummy to the southeast is for practice — " +
          'walk beside it and swing when you are ready.',
        options: [
          { label: 'Thanks for the tip.', next: 'tip_reply', setState: NPC_STATE_TALKED_ONCE },
          { label: 'Goodbye.', setState: NPC_STATE_TALKED_ONCE },
        ],
      },
      tip_reply: {
        text: 'When you take on real foes, mind your pathing — they hit hard if you stand still.',
        options: [{ label: 'I will.' }],
      },
      return_visit: {
        text: 'Back again? Keep training; the wilds beyond are less forgiving than the dummy.',
        options: [
          { label: 'Any other advice?', next: 'extra_advice' },
          { label: 'Farewell.' },
        ],
      },
      extra_advice: {
        text: 'Harvest nodes at the map edges when you need ore, wood, or fish — stand beside them and wait.',
        options: [{ label: 'Thanks.' }],
      },
    },
  },
  [NPC_IDS.barnaby]: {
    roots: {
      [NPC_STATE_DEFAULT]: 'intro',
      [NPC_STATE_TALKED_ONCE]: 'short_hi',
    },
    nodes: {
      intro: {
        text:
          "Barnaby's the name. I used to haul nets before my back gave out. " +
          'The sparkling pools are fine fishing if you have the patience.',
        options: [
          { label: 'Ill try fishing sometime.', next: 'encourage', setState: NPC_STATE_TALKED_ONCE },
          { label: 'See you.', setState: NPC_STATE_TALKED_ONCE },
        ],
      },
      encourage: {
        text: 'Mind your inventory — nothing worse than a full pack when the trout are biting.',
        options: [{ label: 'Fair point.' }],
      },
      short_hi: {
        text: 'Ho there. Water still wet, fish still slippery?',
        options: [
          { label: 'So it seems.' },
          { label: 'Tell me about the nodes again.', next: 'nodes_reminder' },
        ],
      },
      nodes_reminder: {
        text: 'Rock, tree, pool — one of each kind on the margins of this plot. Stand next to them and give it time.',
        options: [{ label: 'Got it.' }],
      },
    },
  },
};
