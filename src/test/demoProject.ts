/**
 * Demo project generator — "The Clockwork Heart".
 *
 * A small steampunk visual novel that intentionally exercises (almost) every
 * Purl block type EXCEPT the AI-generation blocks (image-gen / audio-gen /
 * video-gen) and the plugin block. It doubles as living documentation of what
 * Purl can do and as an export/validation fixture.
 *
 * Authoring conventions that matter (verified against the store + exporter):
 *  - ALL nav targets (choice / link / menu-link / function / popup /
 *    open-popup.targetSceneId AND include.passageName) store the **scene id**.
 *    migrateSceneLinks keeps ids and resolves names→ids; the exporter maps
 *    id→passage-name. Fixtures author by id, so we do too.
 *  - Entity variable trees mirror the store helpers exactly:
 *      character → root group named `varName`, children:
 *        name, styles{bgColor,borderColor,nameColor,textColor,avatar,
 *        llm_descr,llm_temperature}, inventory[], money, equipment{slots}
 *      item      → under root `items` group: name,icon,price,description,
 *                  stackable(,slot for wearable)
 *      quest     → under root `quests` group: name,description,state,category
 *                  (+ steps{...} for composite)
 *      container → under root `containers` group: items[]
 *  - We use readable string ids (not UUIDs). Ids are opaque strings everywhere
 *    in the data model, so this is purely a legibility choice.
 */

import type {
  Project, Scene, Block, Character, ItemDefinition, ContainerDefinition,
  QuestDefinition, QuestCategory, Variable, VariableGroup, VariableTreeNode,
  ButtonStyle, CharacterVarIds, ItemVarIds, QuestVarIds, ContainerVarIds,
  SidebarSceneConfig, PaperdollConfig, BlockStyleOverride,
} from '../types';

// ─── tiny builders ────────────────────────────────────────────────────────────

const v = (
  id: string, name: string, varType: Variable['varType'], defaultValue: string,
  description = '', isExpression?: boolean,
): Variable => ({ kind: 'variable', id, name, varType, defaultValue, description, ...(isExpression ? { isExpression } : {}) });

const grp = (id: string, name: string, children: VariableTreeNode[]): VariableGroup =>
  ({ kind: 'group', id, name, children });

/** Identity helper that forces each block literal to type-check against Block. */
const B = <T extends Block>(b: T): T => b;

const btn = (bgColor: string, textColor: string, borderColor: string): ButtonStyle =>
  ({ bgColor, textColor, borderColor, borderRadius: 6, paddingV: 6, paddingH: 14, fontSize: 10, bold: false, fullWidth: false });

// ─── scene ids ──────────────────────────────────────────────────────────────────

const S = {
  start:    'sc_start',
  town:     'sc_town',
  workshop: 'sc_workshop',
  shop:     'sc_shop',
  wardrobe: 'sc_wardrobe',
  questlog: 'sc_questlog',
  settings: 'sc_settings',
  finale:   'sc_finale',
  docks:    'sc_docks',
  giveRose: 'sc_give_rose',
  // chrome (system) scenes
  caption:  'sc_caption',
  title:    'sc_title',
  menu:     'sc_menu',
  header:   'sc_header',
  footer:   'sc_footer',
  // func scenes
  giveGift: 'sc_give_gift',
  useTonic: 'sc_use_tonic',
  // popup scenes
  popWelcome: 'sc_pop_welcome',
  popHelp:    'sc_pop_help',
  // include target
  shared:   'sc_shared_tip',
} as const;

// ─── root (non-entity) variables ────────────────────────────────────────────────

const V = {
  affection:  'var_affection',
  playerName: 'var_playername',
  gameTime:   'var_gametime',
  worldState: 'var_worldstate',
  difficulty: 'var_difficulty',
  theme:      'var_theme',
  textSpeed:  'var_textspeed',
  party:      'var_party',
  optHints:   'var_opt_hints',
  optNews:    'var_opt_news',
  metElara:   'var_met_elara',
  foundPurse: 'var_found_purse',
  gaveRose:   'var_gave_rose',
} as const;

const rootVars: VariableTreeNode[] = [
  v(V.affection,  'affection',  'number',  '0',  'Elara affection 0–100'),
  v(V.playerName, 'playerName', 'string',  'Traveler', 'Player-entered name'),
  v(V.gameTime,   'gameTime',   'datetime','new Date(2025,5,8,8,0)', 'In-story clock', true),
  v(V.worldState, 'worldState', 'string',  '{}', 'Structured world state object', true),
  v(V.difficulty, 'difficulty', 'string',  'Normal', 'Chosen difficulty'),
  v(V.theme,      'theme',      'string',  'brass', 'Chosen UI theme'),
  v(V.textSpeed,  'textSpeed',  'number',  '60', 'Text speed 0–100'),
  v(V.party,      'partyMembers','array',  '["Elara Voss","Doran Pike"]', 'Named acquaintances'),
  v(V.optHints,   'showHints',  'boolean', 'true',  'Show gameplay hints'),
  v(V.optNews,    'subscribeNews','boolean','false','Opt into in-world news'),
  v(V.metElara,   'metElara',   'boolean', 'false', 'Has met Elara yet'),
  v(V.foundPurse, 'foundPurse', 'boolean', 'false', 'Has found the purse at the docks'),
  v(V.gaveRose,   'gaveRose',   'boolean', 'false', 'Has gifted the clockwork rose'),
];

// ─── characters (root group per varName, mirroring buildCharVarNodes) ─────────────

interface BuiltChar { character: Character; group: VariableGroup; moneyVarId: string; }

function buildChar(opts: {
  id: string; name: string; varName: string;
  bgColor: string; borderColor: string; nameColor: string; textColor: string;
  isHero?: boolean; avatarSrc?: string; llmDescr?: string;
  paperdoll?: PaperdollConfig;
  initialInventory?: Character['initialInventory'];
  customDialogueStyle?: BlockStyleOverride;
  initialMoney?: string;
}): BuiltChar {
  const p = opts.varName;
  const ids = {
    groupId: `cg_${p}`, stylesGroupId: `cg_${p}_styles`,
    nameVarId: `cv_${p}_name`, bgColorVarId: `cv_${p}_bg`, borderColorVarId: `cv_${p}_border`,
    nameColorVarId: `cv_${p}_namecolor`, textColorVarId: `cv_${p}_textcolor`, avatarVarId: `cv_${p}_avatar`,
    llmDescrVarId: `cv_${p}_llmdescr`, llmTemperatureVarId: `cv_${p}_llmtemp`,
    inventoryVarId: `cv_${p}_inventory`, moneyVarId: `cv_${p}_money`,
  };
  const stylesGroup = grp(ids.stylesGroupId, 'styles', [
    v(ids.bgColorVarId,     'bgColor',     'string', opts.bgColor,     'Dialogue background color'),
    v(ids.borderColorVarId, 'borderColor', 'string', opts.borderColor, 'Dialogue border color'),
    v(ids.nameColorVarId,   'nameColor',   'string', opts.nameColor,   'Character name color'),
    v(ids.textColorVarId,   'textColor',   'string', opts.textColor,   'Dialogue text color'),
    v(ids.avatarVarId,      'avatar',      'string', opts.avatarSrc ?? '', `Avatar URL for "${opts.name}" (empty = hidden)`),
    v(ids.llmDescrVarId,    'llm_descr',   'string', opts.llmDescr ?? '', `LLM personality for "${opts.name}"`),
    v(ids.llmTemperatureVarId, 'llm_temperature', 'number', '', `LLM temperature for "${opts.name}"`),
  ]);
  const children: VariableTreeNode[] = [
    v(ids.nameVarId, 'name', 'string', opts.name, `Character name "${opts.name}"`),
    stylesGroup,
    v(ids.inventoryVarId, 'inventory', 'array',  '[]', `Inventory for "${opts.name}"`),
    v(ids.moneyVarId,     'money',     'number', opts.initialMoney ?? '0',  `Money for "${opts.name}"`),
  ];

  const varIds: CharacterVarIds = { ...ids };

  if (opts.paperdoll?.slots.length) {
    const equipmentGroupId = `cg_${p}_equipment`;
    const slotVars = opts.paperdoll.slots.map(sl =>
      v(`cv_${p}_eq_${sl.id}`, sl.id, 'string',
        sl.defaultItemVarName ?? '', `Paperdoll slot "${sl.label}" for "${opts.name}"`));
    children.push(grp(equipmentGroupId, 'equipment', slotVars));
    varIds.equipmentGroupId = equipmentGroupId;
  }

  const character: Character = {
    id: opts.id, name: opts.name, varName: opts.varName,
    nameColor: opts.nameColor, textColor: opts.textColor,
    bgColor: opts.bgColor, borderColor: opts.borderColor,
    llm_descr: opts.llmDescr,
    isHero: opts.isHero,
    initialInventory: opts.initialInventory ?? [],
    paperdoll: opts.paperdoll,
    varIds,
    ...(opts.customDialogueStyle ? { customDialogueStyle: opts.customDialogueStyle } : {}),
  };
  return { character, group: grp(ids.groupId, opts.varName, children), moneyVarId: ids.moneyVarId };
}

const heroPaperdoll: PaperdollConfig = {
  gridCols: 3, gridRows: 2, cellSize: 64,
  slots: [
    { id: 'head',    label: 'Head',    row: 1, col: 1, clickable: true, defaultItemVarName: 'goggles' },
    { id: 'hand',    label: 'Hand',    row: 1, col: 2, clickable: true },
    { id: 'trinket', label: 'Trinket', row: 1, col: 3, clickable: true, defaultItemVarName: 'pocketwatch' },
  ],
};

const hero = buildChar({
  id: 'char_traveler', name: 'Traveler', varName: 'traveler',
  bgColor: '#1e293b', borderColor: '#475569', nameColor: '#cbd5e1', textColor: '#e2e8f0',
  isHero: true, paperdoll: heroPaperdoll,
  initialInventory: [
    { id: 'inv_goggles', itemVarName: 'goggles', quantity: 1, equipped: true },
    { id: 'inv_watch',   itemVarName: 'pocketwatch', quantity: 1, equipped: true },
    { id: 'inv_tonic',   itemVarName: 'tonic', quantity: 2, equipped: false },
  ],
  initialMoney: '30',
});

const elara = buildChar({
  id: 'char_elara', name: 'Elara Voss', varName: 'elara',
  bgColor: '#2e1065', borderColor: '#a855f7', nameColor: '#d8b4fe', textColor: '#ede9fe',
  avatarSrc: 'assets/chars/elara.png',
  llmDescr: 'A brilliant, slightly distracted clockwork inventor. Warm but guarded.',
  customDialogueStyle: { enabled: true, mode: 'static', fields: { borderRadius: 10 } },
});

const doran = buildChar({
  id: 'char_doran', name: 'Doran Pike', varName: 'doran',
  bgColor: '#422006', borderColor: '#d97706', nameColor: '#fbbf24', textColor: '#fef3c7',
  avatarSrc: 'assets/chars/doran.png',
  llmDescr: 'A jovial, shrewd merchant who always has "just the thing".',
});

const characters: Character[] = [hero.character, elara.character, doran.character];

// ─── items (under root `items` group, mirroring buildItemVarNodes) ────────────────

interface BuiltItem { item: ItemDefinition; group: VariableGroup; }

function buildItem(opts: {
  id: string; name: string; varName: string;
  category: ItemDefinition['category']; stackable: boolean;
  price: number; description: string; iconSrc: string;
  targetSlot?: string; useFuncSceneId?: string;
}): BuiltItem {
  const p = opts.varName;
  const ids: ItemVarIds = {
    itemsRootGroupId: 'grp_items', groupId: `ig_${p}`,
    nameVarId: `iv_${p}_name`, iconVarId: `iv_${p}_icon`, priceVarId: `iv_${p}_price`,
    descVarId: `iv_${p}_desc`, stackableVarId: `iv_${p}_stackable`,
    ...(opts.category === 'wearable' ? { slotVarId: `iv_${p}_slot` } : {}),
  };
  const children: Variable[] = [
    v(ids.nameVarId, 'name', 'string', opts.name, `Display name for item "${opts.name}"`),
    v(ids.iconVarId, 'icon', 'string', opts.iconSrc, `Icon path for item "${opts.name}"`),
    v(ids.priceVarId, 'price', 'number', String(opts.price), `Price of item "${opts.name}"`),
    v(ids.descVarId, 'description', 'string', opts.description, `Description of item "${opts.name}"`),
    v(ids.stackableVarId, 'stackable', 'boolean', opts.stackable ? 'true' : 'false', ''),
  ];
  if (ids.slotVarId) {
    children.push(v(ids.slotVarId, 'slot', 'string', (opts.targetSlot ?? '').toLowerCase(), `Paperdoll slot for "${opts.name}"`));
  }
  const item: ItemDefinition = {
    id: opts.id, name: opts.name, varName: opts.varName,
    category: opts.category, stackable: opts.stackable,
    description: opts.description,
    iconConfig: { mode: 'static', src: opts.iconSrc },
    customProps: [],
    ...(opts.targetSlot ? { targetSlot: opts.targetSlot } : {}),
    ...(opts.useFuncSceneId ? { useFuncSceneId: opts.useFuncSceneId } : {}),
    varIds: ids,
  };
  return { item, group: grp(ids.groupId, opts.varName, children) };
}

const itGoggles = buildItem({ id: 'item_goggles', name: 'Brass Goggles', varName: 'goggles', category: 'wearable', stackable: false, price: 40, description: 'Polished brass goggles with amber lenses.', iconSrc: 'assets/Items/goggles.png', targetSlot: 'head' });
const itWatch   = buildItem({ id: 'item_watch', name: 'Pocket Watch', varName: 'pocketwatch', category: 'wearable', stackable: false, price: 120, description: 'A ticking heirloom that never seems to stop.', iconSrc: 'assets/Items/watch.png', targetSlot: 'trinket' });
const itLantern = buildItem({ id: 'item_lantern', name: 'Aether Lantern', varName: 'lantern', category: 'wearable', stackable: false, price: 65, description: 'A handheld lantern lit by humming aether.', iconSrc: 'assets/Items/lantern.png', targetSlot: 'hand' });
const itTonic   = buildItem({ id: 'item_tonic', name: 'Healing Tonic', varName: 'tonic', category: 'consumable', stackable: true, price: 15, description: 'Restores a little vigor. Tastes of copper.', iconSrc: 'assets/Items/tonic.png', useFuncSceneId: S.useTonic });
const itGear    = buildItem({ id: 'item_gear', name: 'Copper Gear', varName: 'gear', category: 'misc', stackable: true, price: 8, description: 'A small, oddly warm copper gear.', iconSrc: 'assets/Items/gear.png' });
const itRose    = buildItem({ id: 'item_rose', name: 'Clockwork Rose', varName: 'rose', category: 'wearable', stackable: false, price: 150, description: 'A delicate, humming rose made of brass and ruby glass.', iconSrc: 'assets/Items/rose.png', targetSlot: 'trinket' });

const builtItems = [itGoggles, itWatch, itLantern, itTonic, itGear, itRose];
const items: ItemDefinition[] = builtItems.map(b => b.item);
const itemsGroup = grp('grp_items', 'items', builtItems.map(b => b.group));

// ─── containers (under root `containers` group) ───────────────────────────────────

function buildContainerItemsLiteral(slots: ContainerDefinition['initialItems']): string {
  if (!slots.length) return '[]';
  return `[${slots.map(s => {
    const parts = [`item:"${s.itemVarName}",qty:${s.quantity}`];
    if (s.price !== undefined) parts.push(`price:${s.price}`);
    return `{${parts.join(',')}}`;
  }).join(',')}]`;
}

const emporiumStock: ContainerDefinition['initialItems'] = [
  { id: 'cs_lantern', itemVarName: 'lantern', quantity: 3, price: 65 },
  { id: 'cs_tonic',   itemVarName: 'tonic',   quantity: -1, price: 15 },
  { id: 'cs_gear',    itemVarName: 'gear',    quantity: 5,  price: 8 },
];

const docksDebrisStock: ContainerDefinition['initialItems'] = [
  { id: 'cs_rose', itemVarName: 'rose', quantity: 1 },
];

const containerVarIds: ContainerVarIds = {
  containersRootGroupId: 'grp_containers', groupId: 'kg_emporium', itemsVarId: 'kv_emporium_items',
};
const docksDebrisVarIds: ContainerVarIds = {
  containersRootGroupId: 'grp_containers', groupId: 'kg_debris', itemsVarId: 'kv_debris_items',
};
const emporium: ContainerDefinition = {
  id: 'cont_emporium', name: "Doran's Emporium", varName: 'emporium', mode: 'shop',
  initialItems: emporiumStock, varIds: containerVarIds,
};
const docksDebris: ContainerDefinition = {
  id: 'cont_debris', name: 'Rusted Debris', varName: 'debris', mode: 'loot',
  initialItems: docksDebrisStock, varIds: docksDebrisVarIds,
};
const containersGroup = grp('grp_containers', 'containers', [
  grp('kg_emporium', 'emporium', [
    v('kv_emporium_items', 'items', 'array', buildContainerItemsLiteral(emporiumStock), 'Stock for container "emporium"'),
  ]),
  grp('kg_debris', 'debris', [
    v('kv_debris_items', 'items', 'array', buildContainerItemsLiteral(docksDebrisStock), 'Stock for container "debris"'),
  ]),
]);
const containers: ContainerDefinition[] = [emporium, docksDebris];

// ─── quests (under root `quests` group, composite) ────────────────────────────────

const questCategories: QuestCategory[] = [
  { id: 'qcat_main', name: 'Main', color: '#a855f7' },
];

const questSteps = [
  { id: 'qs_talk',   name: 'Speak with Elara', varName: 'talkElara',  description: 'Find the inventor in her workshop.', initialState: 'active' as const },
  { id: 'qs_get',    name: 'Acquire a copper gear', varName: 'getGear', description: 'Buy one from Doran.', initialState: 'hidden' as const },
  { id: 'qs_return', name: 'Return the gear', varName: 'returnGear', description: 'Bring it back to Elara.', initialState: 'hidden' as const },
];

const questVarIds: QuestVarIds = {
  questsRootGroupId: 'grp_quests', groupId: 'qg_missing',
  nameVarId: 'qv_missing_name', descVarId: 'qv_missing_desc', stateVarId: 'qv_missing_state', categoryVarId: 'qv_missing_cat',
  stepsGroupId: 'qg_missing_steps',
  stepVarIds: {
    qs_talk:   { groupId: 'qg_step_talk',   nameVarId: 'qv_talk_name',   descVarId: 'qv_talk_desc',   stateVarId: 'qv_talk_state' },
    qs_get:    { groupId: 'qg_step_get',    nameVarId: 'qv_get_name',    descVarId: 'qv_get_desc',    stateVarId: 'qv_get_state' },
    qs_return: { groupId: 'qg_step_return', nameVarId: 'qv_return_name', descVarId: 'qv_return_desc', stateVarId: 'qv_return_state' },
  },
};

const missingGearQuest: QuestDefinition = {
  id: 'quest_missing', name: 'The Missing Gear', varName: 'missingGear',
  description: "Elara's masterwork is one gear short of ticking.",
  categoryId: 'qcat_main', initialState: 'active', composite: true, ordered: true, autoCompleteParent: true,
  steps: questSteps, varIds: questVarIds,
};
const quests: QuestDefinition[] = [missingGearQuest];

const questsGroup = grp('grp_quests', 'quests', [
  grp('qg_missing', 'missingGear', [
    v('qv_missing_name', 'name', 'string', 'The Missing Gear', 'Quest name'),
    v('qv_missing_desc', 'description', 'string', "Elara's masterwork is one gear short of ticking.", ''),
    v('qv_missing_state', 'state', 'string', 'active', 'Quest state: hidden|active|done|failed'),
    v('qv_missing_cat', 'category', 'string', 'Main', ''),
    grp('qg_missing_steps', 'steps', questSteps.map(st => {
      const ids = questVarIds.stepVarIds![st.id];
      return grp(ids.groupId, st.varName, [
        v(ids.nameVarId, 'name', 'string', st.name, ''),
        v(ids.descVarId, 'description', 'string', st.description ?? '', ''),
        v(ids.stateVarId, 'state', 'string', st.initialState, ''),
      ]);
    })),
  ]),
]);

// ─── sidebar group (mirrors makeSidePanelGroup) ───────────────────────────────────

const sidePanelGroup = grp('grp_sidepanel', 'sidePanel', [
  v('sp_hidden', 'hidden', 'boolean', 'false', 'Hide the UIBar entirely.'),
  v('sp_width', 'width', 'number', '18', 'UIBar width.'),
  v('sp_position', 'position', 'string', '"left"', 'UIBar side.'),
  v('sp_collapsed', 'initiallyCollapsed', 'boolean', 'false', 'Start collapsed.'),
  v('sp_allow', 'allowCollapse', 'boolean', 'true', 'Show the hamburger toggle.'),
  v('sp_bg', 'bgColor', 'string', '""', 'UIBar background color.'),
  v('sp_history', 'show_history', 'boolean', 'true', 'Show history nav.'),
  v('sp_saves', 'show_saves', 'boolean', 'true', 'Show save/load menu.'),
]);
const sidebarConfig: SidebarSceneConfig = {
  kind: 'sidebar',
  hidden: { variableId: 'sp_hidden' }, width: { variableId: 'sp_width' },
  position: { variableId: 'sp_position' }, initiallyCollapsed: { variableId: 'sp_collapsed' },
  allowCollapse: { variableId: 'sp_allow' }, bgColor: { variableId: 'sp_bg' },
  historyControls: { variableId: 'sp_history' }, saveLoadMenu: { variableId: 'sp_saves' },
  fontFamily: 'Georgia, serif', blockGap: 10,
};

// ─── variableNodes assembly ───────────────────────────────────────────────────────

const variableNodes: VariableTreeNode[] = [
  sidePanelGroup,
  ...rootVars,
  hero.group, elara.group, doran.group,
  itemsGroup,
  containersGroup,
  questsGroup,
];

// ─── scene blocks ─────────────────────────────────────────────────────────────────
// Each scene below is annotated with the block types it contributes to coverage.

const startBlocks: Block[] = [
  B({ id: 'b_start_note', type: 'note', text: 'Opening scene. Sets player name, seeds world state, plays ambience.' }),
  B({ id: 'b_start_audio', type: 'audio', src: 'assets/audio/ambient_harbor.mp3', trigger: 'immediate', loop: true, onLeave: 'persist', stopOthers: false, volume: 55 }),
  B({ id: 'b_start_callout', type: 'callout', variant: 'info', title: 'How to play', content: "Click choices and links to move through the story. Your stats live in the sidebar." }),
  B({ id: 'b_start_text', type: 'text', content: "Steam hisses from the cobbled streets of **Cogsworth**. A telegram in your pocket reads only: //come quickly — E.//", typewriter: { speed: 25 } }),
  B({ id: 'b_start_input', type: 'input-field', label: 'What do they call you?', variableId: V.playerName, placeholder: 'Traveler' }),
  // Seed a structured object via set-object
  B({ id: 'b_start_world', type: 'set-object', variableId: V.worldState, entries: [
    { id: 'wo_town', key: 'townName', valueType: 'string', value: 'Cogsworth' },
    { id: 'wo_day', key: 'day', valueType: 'number', value: '1' },
    { id: 'wo_fog', key: 'foggy', valueType: 'boolean', value: 'true' },
    { id: 'wo_exits', key: 'exits', valueType: 'array', value: '["north","docks"]' },
    { id: 'wo_meta', key: 'meta', valueType: 'object', entries: [
      { id: 'wo_chapter', key: 'chapter', valueType: 'number', value: '1' },
    ] },
  ] }),
  B({ id: 'b_start_save', type: 'save', title: 'Arrival', notify: true, notifyText: 'Progress saved' }),
  B({ id: 'b_start_divider', type: 'divider', color: '#475569', thickness: 1, marginV: 12 }),
  B({ id: 'b_start_choice', type: 'choice', options: [
    { id: 'o_start_go', label: 'Head into town', targetSceneId: S.town, condition: '' },
  ] }),
  // Auto-open a welcome popup on render
  B({ id: 'b_start_popup', type: 'popup', targetSceneId: S.popWelcome, title: 'Welcome' }),
];

const townBlocks: Block[] = [
  B({ id: 'b_town_text', type: 'text', content: 'The town square churns with gears and gossip. Three lanes branch away from the fountain.' }),
  // Advance the clock an hour on arrival (invisible)
  B({ id: 'b_town_time', type: 'time-manipulation', variableId: V.gameTime, years: 0, months: 0, days: 0, hours: 1, minutes: 0 }),
  // (The quest already starts active with its first step active from StoryInit,
  //  so no quest-set is needed here — re-running one on every hub visit would
  //  rewind later progress.)
  B({ id: 'b_town_spacer', type: 'spacer', size: 10 }),
  B({ id: 'b_town_links_section', type: 'section', title: 'Where to?', blocks: [
    B({ id: 'b_town_l1', type: 'link', label: "Elara's Workshop", target: 'scene', targetSceneId: S.workshop, actions: [], style: btn('#3b82f6', '#fff', '#2563eb') }),
    B({ id: 'b_town_l2', type: 'link', label: "Doran's Emporium", target: 'scene', targetSceneId: S.shop, actions: [], style: btn('#d97706', '#fff', '#b45309') }),
    B({ id: 'b_town_l6', type: 'link', label: 'The Foggy Docks', target: 'scene', targetSceneId: S.docks, actions: [], style: btn('#334155', '#fff', '#1e293b') }),
    B({ id: 'b_town_l3', type: 'link', label: 'Your satchel & gear', target: 'scene', targetSceneId: S.wardrobe, actions: [], style: btn('#0d9488', '#fff', '#0f766e') }),
    B({ id: 'b_town_l4', type: 'link', label: 'Quest journal', target: 'scene', targetSceneId: S.questlog, actions: [], style: btn('#7c3aed', '#fff', '#6d28d9') }),
    B({ id: 'b_town_l5', type: 'link', label: 'Settings', target: 'scene', targetSceneId: S.settings, actions: [], style: btn('#475569', '#fff', '#334155') }),
  ] }),
];

const workshopBlocks: Block[] = [
  B({ id: 'b_ws_img', type: 'image', mode: 'static', src: 'assets/chars/elara_full.png', alt: 'Elara at her workbench', width: 320 }),
  B({ id: 'b_ws_set_met', type: 'variable-set', variableId: V.metElara, operator: '=', value: 'true' }),
  B({ id: 'b_ws_dlg', type: 'dialogue', characterId: 'char_elara', text: "You came! Oh — mind the springs. My heart-engine is //this// close, but it's missing a single copper gear.", align: 'left', typewriter: { speed: 20 } }),
  // Mark the "talk" step done — guarded so revisiting the workshop never rewinds later progress
  B({ id: 'b_ws_quest_guard', type: 'condition', branches: [
    { id: 'br_ws_quest', branchType: 'if', variableId: 'qv_talk_state', operator: '==', value: 'active', blocks: [
      B({ id: 'b_ws_quest', type: 'quest-set', questId: 'quest_missing', stepStates: [{ stepId: 'qs_talk', state: 'done' }, { stepId: 'qs_get', state: 'active' }] }),
    ] },
  ] }),
  B({ id: 'b_ws_progress', type: 'progress', variableId: V.affection, maxValue: 100, color: '#a855f7', emptyColor: '#312e81', textColor: '#ede9fe', colorRange: { from: '#6366f1', to: '#ec4899' }, showText: true, height: 14 }),
  // Tabs: Talk / Gift / Lore
  B({ id: 'b_ws_tabs', type: 'tabs', defaultTabIndex: 0, tabs: [
    { id: 'tab_talk', label: 'Talk', blocks: [
      B({ id: 'b_ws_talk_btn', type: 'button', label: 'Compliment her work (+5)', style: btn('#22c55e', '#06281a', '#16a34a'), refreshScene: true, actions: [
        { id: 'a_aff', type: 'set-variable', variableId: V.affection, operator: '+=', value: '5' },
      ] }),
      // Condition on affection
      B({ id: 'b_ws_cond', type: 'condition', branches: [
        { id: 'br_high', branchType: 'if', variableId: V.affection, operator: '>=', value: '20', blocks: [
          B({ id: 'b_ws_cond_hi', type: 'dialogue', characterId: 'char_elara', text: 'A warm smile. "You always know what to say."', align: 'left' }),
        ] },
        { id: 'br_low', branchType: 'else', variableId: '', operator: '==', value: '', blocks: [
          B({ id: 'b_ws_cond_lo', type: 'text', content: 'She nods politely, eyes still on her gears.' }),
        ] },
      ] }),
    ] },
    { id: 'tab_gift', label: 'Gift', blocks: [
      B({ id: 'b_ws_gift_gear_cond', type: 'condition', branches: [
        {
          id: 'br_gift_gear_yes',
          branchType: 'if',
          variableId: '', operator: '==', value: '',
          rawExpression: 'tgInvHas($traveler, "gear")',
          blocks: [
            B({ id: 'b_ws_gift_fn', type: 'function', label: 'Offer a copper gear', targetSceneId: S.giveGift, style: btn('#7c3aed', '#fff', '#6d28d9'), actions: [] }),
            B({ id: 'b_ws_gift_hint', type: 'text', content: '//Giving the gear here advances your quest.//' }),
            B({ id: 'b_ws_gift_gear_spacer', type: 'spacer', size: 10 }),
          ]
        }
      ] }),
      B({ id: 'b_ws_gift_rose_cond', type: 'condition', branches: [
        {
          id: 'br_gift_rose_yes',
          branchType: 'if',
          variableId: '', operator: '==', value: '',
          rawExpression: 'tgInvHas($traveler, "rose")',
          blocks: [
            B({ id: 'b_ws_gift_rose_fn', type: 'function', label: 'Offer the Clockwork Rose', targetSceneId: S.giveRose, style: btn('#ec4899', '#fff', '#db2777'), actions: [] }),
            B({ id: 'b_ws_gift_rose_hint', type: 'text', content: '//Offer the rare treasure found at the docks.//' }),
            B({ id: 'b_ws_gift_rose_spacer', type: 'spacer', size: 10 }),
          ]
        }
      ] }),
      B({ id: 'b_ws_gift_none_cond', type: 'condition', branches: [
        {
          id: 'br_gift_none_yes',
          branchType: 'if',
          variableId: '', operator: '==', value: '',
          rawExpression: '!tgInvHas($traveler, "gear") && !tgInvHas($traveler, "rose")',
          blocks: [
            B({ id: 'b_ws_gift_none_text', type: 'text', content: "You don't have any suitable gifts in your satchel right now. Elara needs a copper gear for her engine, but maybe you can find something else in Cogsworth..." })
          ]
        }
      ] })
    ] },
    { id: 'tab_lore', label: 'Lore', blocks: [
      B({ id: 'b_ws_lore', type: 'text', content: 'The heart-engine, she explains, could power the whole harbor — if only it ticked.' }),
      B({ id: 'b_ws_video', type: 'video', src: 'assets/vid/heart_engine.mp4', autoplay: false, loop: false, controls: true, width: 360 }),
    ] },
  ] }),
  B({ id: 'b_ws_help', type: 'button', label: 'Help', style: btn('#334155', '#cbd5e1', '#1e293b'), actions: [
    { id: 'a_help', type: 'open-popup', targetSceneId: S.popHelp, title: 'How gifting works' },
  ] }),
  B({ id: 'b_ws_back', type: 'link', label: 'Return to town', target: 'scene', targetSceneId: S.town, actions: [], style: btn('#475569', '#fff', '#334155') }),
];

const shopBlocks: Block[] = [
  B({ id: 'b_shop_dlg', type: 'dialogue', characterId: 'char_doran', text: "Welcome, welcome! Gears, lanterns, tonics — I've got just the thing.", align: 'right' }),
  B({ id: 'b_shop_container', type: 'container', containerId: 'cont_emporium', title: "Doran's Emporium" }),
  // Completing the "get" step — guarded so re-entering the shop never rewinds progress
  B({ id: 'b_shop_quest_guard', type: 'condition', branches: [
    { id: 'br_shop_quest', branchType: 'if', variableId: 'qv_get_state', operator: '==', value: 'active', blocks: [
      B({ id: 'b_shop_quest', type: 'quest-set', questId: 'quest_missing', stepStates: [{ stepId: 'qs_get', state: 'done' }, { stepId: 'qs_return', state: 'active' }] }),
    ] },
  ] }),
  B({ id: 'b_shop_divider', type: 'divider' }),
  B({ id: 'b_shop_links', type: 'link', label: 'Return to the workshop', target: 'scene', targetSceneId: S.workshop, actions: [], style: btn('#3b82f6', '#fff', '#2563eb') }),
  B({ id: 'b_shop_back', type: 'link', label: 'Return to town', target: 'scene', targetSceneId: S.town, actions: [], style: btn('#475569', '#fff', '#334155') }),
];

const wardrobeBlocks: Block[] = [
  B({ id: 'b_wd_text', type: 'text', content: 'You lay out your belongings and the gear you carry.' }),
  B({ id: 'b_wd_paperdoll', type: 'paperdoll', charId: 'char_traveler', showLabels: true }),
  B({ id: 'b_wd_inv', type: 'inventory', charId: 'char_traveler', title: 'Satchel' }),
  // for-loop over the named acquaintances array
  B({ id: 'b_wd_for', type: 'for', mode: 'range', valueVar: '_member', source: '$partyMembers', blocks: [
    B({ id: 'b_wd_for_text', type: 'text', content: '• <<print _member>>' }),
  ] }),
  B({ id: 'b_wd_use', type: 'function', label: 'Drink a Healing Tonic', targetSceneId: S.useTonic, style: btn('#16a34a', '#fff', '#15803d'), actions: [] }),
  B({ id: 'b_wd_back', type: 'link', label: 'Return to town', target: 'scene', targetSceneId: S.town, actions: [], style: btn('#475569', '#fff', '#334155') }),
];

const questlogBlocks: Block[] = [
  B({ id: 'b_ql_title', type: 'text', content: '## Quest Journal' }),
  B({ id: 'b_ql_show', type: 'quest-show', showDescription: true, showSteps: true, live: true }),
  B({ id: 'b_ql_spacer', type: 'spacer', size: 16 }),
  B({ id: 'b_ql_finish_cond', type: 'condition', branches: [
    {
      id: 'br_ql_finish_yes',
      branchType: 'if',
      variableId: '', operator: '==', value: '',
      rawExpression: '$quests.missingGear.steps.returnGear.state === "active" && tgInvHas($traveler, "gear")',
      blocks: [
        B({ id: 'b_ql_finish', type: 'link', label: 'Bring the gear to Elara', target: 'scene', targetSceneId: S.finale, actions: [], style: btn('#a855f7', '#fff', '#9333ea') }),
      ]
    }
  ] }),
  B({ id: 'b_ql_back', type: 'link', label: 'Return to town', target: 'scene', targetSceneId: S.town, actions: [], style: btn('#475569', '#fff', '#334155') }),
];

const settingsBlocks: Block[] = [
  B({ id: 'b_set_title', type: 'text', content: '## Settings' }),
  B({ id: 'b_set_diff', type: 'radio', label: 'Difficulty', variableId: V.difficulty, options: [
    { id: 'rd_easy', label: 'Gentle', value: 'Easy' },
    { id: 'rd_normal', label: 'Balanced', value: 'Normal' },
    { id: 'rd_hard', label: 'Clockwork', value: 'Hard' },
  ] }),
  B({ id: 'b_set_theme', type: 'select', label: 'Interface theme', variableId: V.theme, options: [
    { id: 'sl_brass', label: 'Brass', value: 'brass' },
    { id: 'sl_copper', label: 'Copper', value: 'copper' },
    { id: 'sl_iron', label: 'Iron', value: 'iron' },
  ] }),
  B({ id: 'b_set_speed', type: 'slider', label: 'Text speed', variableId: V.textSpeed, min: 0, max: 100, step: 5, showValue: true }),
  B({ id: 'b_set_checks', type: 'checkbox', label: 'Preferences', mode: 'flags', options: [
    { id: 'ck_hints', label: 'Show gameplay hints', variableId: V.optHints },
    { id: 'ck_news', label: 'Subscribe to the Cogsworth Courier', variableId: V.optNews },
  ] }),
  B({ id: 'b_set_vol', type: 'audio-volume', showMuteButton: true }),
  B({ id: 'b_set_divider', type: 'divider' }),
  // A small reference table (nested blocks per cell)
  B({ id: 'b_set_table', type: 'table', style: { rowGap: 4, borderWidth: 1, borderColor: '#334155', showOuterBorder: true, showRowBorders: true, showCellBorders: true }, rows: [
    { id: 'tr_h', height: 28, cells: [
      { id: 'tc_h1', width: 50, blocks: [B({ id: 'b_tbl_h1', type: 'text', content: '**Control**' })] },
      { id: 'tc_h2', width: 50, blocks: [B({ id: 'b_tbl_h2', type: 'text', content: '**Effect**' })] },
    ] },
    { id: 'tr_1', height: 28, cells: [
      { id: 'tc_11', width: 50, blocks: [B({ id: 'b_tbl_11', type: 'text', content: 'Choice' })] },
      { id: 'tc_12', width: 50, blocks: [B({ id: 'b_tbl_12', type: 'text', content: 'Branches the story' })] },
    ] },
  ] }),
  // Embed a shared passage
  B({ id: 'b_set_include', type: 'include', passageName: S.shared, bordered: true, borderColor: '#475569', padding: 8, borderRadius: 6 }),
  // Raw HTML escape hatch
  B({ id: 'b_set_raw', type: 'raw', code: '<small style="opacity:.7">Built with Purl — a no-code SugarCube studio.</small>' }),
  B({ id: 'b_set_back', type: 'link', label: 'Return to town', target: 'scene', targetSceneId: S.town, actions: [], style: btn('#475569', '#fff', '#334155') }),
];

const finaleBlocks: Block[] = [
  B({ id: 'b_fin_quest', type: 'quest-set', questId: 'quest_missing', parentState: 'done', stepStates: [{ stepId: 'qs_return', state: 'done' }] }),
  B({ id: 'b_fin_cond', type: 'condition', branches: [
    { id: 'fb_rose', branchType: 'if', variableId: '', operator: '==', value: '', rawExpression: '$gaveRose', blocks: [
      B({ id: 'b_fin_dlg_rose', type: 'dialogue', characterId: 'char_elara', text: 'Elara holds the Clockwork Rose, its gears ticking softly in unison with the heart-engine. She looks up at you, her eyes shining. "The engine is perfect, but this rose... it makes this workshop feel like a home. Thank you for bringing light back into my life."', align: 'left' }),
      B({ id: 'b_fin_callout_rose', type: 'callout', variant: 'success', title: 'A perfect ending', content: 'The clockwork rose blooms, and the heart-engine sings a song of a new dawn.' }),
    ] },
    { id: 'fb_warm', branchType: 'elseif', variableId: '', operator: '==', value: '', rawExpression: '$affection >= 15', blocks: [
      B({ id: 'b_fin_dlg_warm', type: 'dialogue', characterId: 'char_elara', text: 'The engine ticks — then //sings//. She takes your hand. "Stay a while?"', align: 'left' }),
      B({ id: 'b_fin_callout_warm', type: 'callout', variant: 'success', title: 'A warm ending', content: 'The clockwork heart beats in time with two others.' }),
    ] },
    { id: 'fb_cool', branchType: 'else', variableId: '', operator: '==', value: '', blocks: [
      B({ id: 'b_fin_dlg_cool', type: 'dialogue', characterId: 'char_elara', text: 'The engine ticks to life. "Thank you, friend. Truly."', align: 'left' }),
      B({ id: 'b_fin_callout_cool', type: 'callout', variant: 'note', title: 'A quiet ending', content: 'Cogsworth hums a little brighter tonight.' }),
    ] },
  ] }),
  B({ id: 'b_fin_save', type: 'save', title: 'The end', notify: false }),
  B({ id: 'b_fin_divider', type: 'divider', color: '#a855f7', thickness: 2, marginV: 16 }),
  B({ id: 'b_fin_restart', type: 'menu-link', label: '↺ Play again', target: 'restart', actions: [] }),
];

// ─── chrome (system) scenes ───────────────────────────────────────────────────────

const captionBlocks: Block[] = [
  B({ id: 'b_cap_section', type: 'section', title: 'Status', collapsible: false, blocks: [
    B({ id: 'b_cap_dt', type: 'date-time', variableId: V.gameTime, displayMode: 'digital-calendar', format: 'DD MMM, HH:mm', prefix: '', suffix: '' }),
    B({ id: 'b_cap_aff_label', type: 'text', content: 'Affection' }),
    B({ id: 'b_cap_aff', type: 'progress', variableId: V.affection, maxValue: 100, color: '#ec4899', emptyColor: '#312e81', textColor: '#fce7f3', colorRange: null, showText: true, height: 12 }),
    B({ id: 'b_cap_sheet', type: 'display-object', source: 'manual', autoSync: false, layout: 'list', live: true, fields: [
      { id: 'do_name', variableId: V.playerName, label: 'Name', render: 'text' },
      { id: 'do_gold', variableId: hero.moneyVarId, label: 'Coin', render: 'text' },
      { id: 'do_aff', variableId: V.affection, label: 'Affection', render: 'bar', maxValue: 100 },
    ] }),
  ] }),
  B({ id: 'b_cap_quests', type: 'quest-show', filterStates: ['active'], showDescription: false, showSteps: true, live: true }),
];

const titleBlocks: Block[] = [
  B({ id: 'b_title_text', type: 'text', content: 'The Clockwork Heart' }),
];

const menuBlocks: Block[] = [
  B({ id: 'b_menu_settings', type: 'menu-link', label: 'Settings', target: 'scene', targetSceneId: S.settings, actions: [] }),
  B({ id: 'b_menu_journal', type: 'menu-link', label: 'Journal', target: 'scene', targetSceneId: S.questlog, actions: [] }),
  B({ id: 'b_menu_saves', type: 'menu-link', label: 'Saves', target: 'saves', actions: [] }),
  B({ id: 'b_menu_restart', type: 'menu-link', label: 'Restart', target: 'restart', actions: [] }),
];

const headerBlocks: Block[] = [
  B({ id: 'b_hdr_raw', type: 'raw', code: '<div style="text-align:center;opacity:.6;font-variant:small-caps">Cogsworth</div>' }),
];

const footerBlocks: Block[] = [
  B({ id: 'b_ftr_divider', type: 'divider', color: '#334155', thickness: 1, marginV: 6 }),
  B({ id: 'b_ftr_text', type: 'text', content: '//A Purl demonstration story.//' }),
];

// ─── func + popup + include scenes ────────────────────────────────────────────────

const giveGiftBlocks: Block[] = [
  B({ id: 'b_gg_aff', type: 'variable-set', variableId: V.affection, operator: '+=', value: '10' }),
  B({ id: 'b_gg_remove_gear', type: 'raw', code: '<<tgInvRemove $traveler "gear" 1>>' }),
  B({ id: 'b_gg_text', type: 'text', content: "Elara turns the gear over, eyes bright. \"Where did you—? Never mind. //Thank you.//\"" }),
];

const giveRoseBlocks: Block[] = [
  B({ id: 'b_gr_aff', type: 'variable-set', variableId: V.affection, operator: '+=', value: '20' }),
  B({ id: 'b_gr_set_gave', type: 'variable-set', variableId: V.gaveRose, operator: '=', value: 'true' }),
  B({ id: 'b_gr_remove_rose', type: 'raw', code: '<<tgInvRemove $traveler "rose" 1>>\n<<set $traveler.equipment.trinket to "">>' }),
  B({ id: 'b_gr_dlg', type: 'dialogue', characterId: 'char_elara', text: "Elara gasps, her fingers gently tracing the brass petals. \"A clockwork rose... I thought these were lost when the Great Foundry burned. It's beautiful... thank you.\"", align: 'left' }),
];

const docksBlocks: Block[] = [
  B({ id: 'b_docks_note', type: 'note', text: 'Docks scene. Checks for equipped Aether Lantern.' }),
  B({ id: 'b_docks_cond', type: 'condition', branches: [
    {
      id: 'br_docks_light',
      branchType: 'if',
      variableId: '', operator: '==', value: '',
      rawExpression: 'tgIsEquipped($traveler, "lantern")',
      blocks: [
        B({ id: 'b_docks_light_text', type: 'text', content: 'The bright blue-white beam of your Aether Lantern cuts through the thick green smog. You walk along the creaking timber pier. Near a rusted, derelict crane, you spot a pile of discarded clockwork scrap. Something gold glints deep within the heap.' }),
        B({ id: 'b_docks_debris_container', type: 'container', containerId: 'cont_debris', title: 'Rusted Debris' }),
      ]
    },
    {
      id: 'br_docks_dark',
      branchType: 'else',
      variableId: '', operator: '==', value: '',
      blocks: [
        B({ id: 'b_docks_dark_text', type: 'text', content: "The thick green fog wraps around the harbor like a wet shroud. You hear waves lapping against the timber piers, but you can't see two steps in front of you. Exploring the docks in this blackness is suicide. You need a light source to pierce this gloom — perhaps Doran at the Emporium has something?" }),
        B({ id: 'b_docks_purse_cond', type: 'condition', branches: [
          {
            id: 'br_purse_found',
            branchType: 'if',
            variableId: '', operator: '==', value: '',
            rawExpression: '$foundPurse',
            blocks: [
              B({ id: 'b_docks_purse_text', type: 'text', content: 'You have already recovered the soggy leather pouch containing 40 gold coins.' })
            ]
          },
          {
            id: 'br_purse_not_found',
            branchType: 'else',
            variableId: '', operator: '==', value: '',
            blocks: [
              B({
                id: 'b_docks_grope_btn',
                type: 'button',
                label: 'Grope blindly in the dark water',
                style: btn('#d97706', '#fff', '#b45309'),
                refreshScene: true,
                actions: [
                  { id: 'a_purse_set', type: 'set-variable', variableId: V.foundPurse, operator: '=', value: 'true' },
                  { id: 'a_purse_gold', type: 'set-variable', variableId: hero.moneyVarId, operator: '+=', value: '40' },
                ]
              })
            ]
          }
        ]})
      ]
    }
  ] }),
  B({ id: 'b_docks_back', type: 'link', label: 'Return to Town Square', target: 'scene', targetSceneId: S.town, actions: [], style: btn('#475569', '#fff', '#334155') })
];

const useTonicBlocks: Block[] = [
  B({ id: 'b_ut_text', type: 'text', content: 'You uncork the tonic and drink. Warmth spreads through your fingers.' }),
];

const popWelcomeBlocks: Block[] = [
  B({ id: 'b_pw_text', type: 'text', content: 'Welcome to **The Clockwork Heart** — a tiny demo built to show off Purl. Explore freely; nothing here can break.' }),
];

const popHelpBlocks: Block[] = [
  B({ id: 'b_ph_text', type: 'text', content: 'Gifting the **Copper Gear** to Elara in the Gift tab advances your quest and raises her affection.' }),
];

const sharedBlocks: Block[] = [
  B({ id: 'b_sh_text', type: 'text', content: '//Tip: your choices and gifts shape which ending you reach.//' }),
];

// ─── scenes ─────────────────────────────────────────────────────────────────────

const scene = (id: string, name: string, blocks: Block[], tags: string[] = [], extra: Partial<Scene> = {}): Scene =>
  ({ id, name, tags, blocks, ...extra });

const scenes: Scene[] = [
  scene(S.start, 'Start', startBlocks, ['start']),
  scene(S.town, 'TownSquare', townBlocks),
  scene(S.workshop, 'Workshop', workshopBlocks),
  scene(S.shop, 'Emporium', shopBlocks),
  scene(S.docks, 'Docks', docksBlocks),
  scene(S.wardrobe, 'Satchel', wardrobeBlocks),
  scene(S.questlog, 'Journal', questlogBlocks),
  scene(S.settings, 'Settings', settingsBlocks),
  scene(S.finale, 'Finale', finaleBlocks),
  // chrome
  scene(S.caption, 'StoryCaption', captionBlocks, ['sidebar'], { systemConfig: sidebarConfig }),
  scene(S.title, 'StoryDisplayTitle', titleBlocks, ['title'], { systemConfig: { kind: 'title', textColor: '#fbbf24', font: 'Georgia, serif' } }),
  scene(S.menu, 'StoryMenu', menuBlocks, ['menu']),
  scene(S.header, 'PassageHeader', headerBlocks, ['passage-header']),
  scene(S.footer, 'PassageFooter', footerBlocks, ['passage-footer']),
  // func
  scene(S.giveGift, 'GiveGift', giveGiftBlocks, ['func']),
  scene(S.giveRose, 'GiveRose', giveRoseBlocks, ['func']),
  scene(S.useTonic, 'tg_use_tonic', useTonicBlocks, ['func']),
  // popups
  scene(S.popWelcome, 'PopupWelcome', popWelcomeBlocks, ['popup']),
  scene(S.popHelp, 'PopupHelp', popHelpBlocks, ['popup']),
  // include target
  scene(S.shared, 'SharedTip', sharedBlocks, ['func']),
];

// ─── project ──────────────────────────────────────────────────────────────────────

export function buildDemoProject(): Project {
  return {
    id: 'proj_clockwork_heart',
    title: 'The Clockwork Heart',
    ifid: 'PURL-DEMO-CLOCKWORK-HEART',
    author: 'Purl',
    description: 'A small steampunk visual novel demonstrating Purl block types.',
    lore: 'Cogsworth: a fog-wrapped harbor town run on brass and aether. The inventor Elara Voss is building a heart-engine to light the whole harbor.',
    settings: {
      storyLanguage: 'English',
      autoloadSave: false,
      bgColor: '#0f172a',
      audioUnlockText: '▶ Click to begin',
    },
    scenes,
    sceneGroups: [],
    characters,
    items,
    containers,
    quests,
    questCategories,
    variableNodes,
    assetNodes: [],
    watchers: [
      {
        id: 'w_affection_glow', label: 'Affection milestone', enabled: true,
        condition: { variableId: V.affection, operator: '>=', value: '30' },
        actions: [{ id: 'wa_news', type: 'set-variable', variableId: V.optNews, operator: '=', value: 'true' }],
      },
    ],
  };
}
