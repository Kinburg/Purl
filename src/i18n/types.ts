/**
 * Shape of a single locale file.
 * Add new keys here, then fill them in every locale file.
 */
export interface Translations {
  /** Display name shown in the language selector */
  locale: { name: string };

  common: {
    confirm: string;
    cancel: string;
    delete: string;
  };

  /** Dialog shown when a new project's target sub-folder already exists. */
  folderConflict: {
    title: string;
    message: (name: string) => string;
    overwrite: string;
    createNew: string;
  };

  sidebar: {
    scenes: string;
    characters: string;
    variables: string;
    assets: string;
    watchers: string;
    items: string;
    containers: string;
    plugins: string;
    quests: string;
    validate: string;
    stats: string;
  };

  validate: {
    allGood: string;
    errors: string;
    warnings: string;
    notices: string;
    run: string;
    rerun: string;
    notRun: string;
    stale: string;
    messages: {
      noStart: string;
      multipleStart: (names: string) => string;
      duplicateName: (name: string) => string;
      danglingTarget: (label: string) => string;
      unreachable: string;
      deadEnd: string;
      emptyScene: string;
      choiceNoTarget: string;
      choiceNoLabel: string;
      emptyBranch: string;
    };
  };

  play: {
    noTemplate: string;
    notBuilt: string;
    build: string;
    rebuild: string;
    reload: string;
    stale: string;
    fromCurrent: string;
    inspector: string;
    variables: string;
    errors: string;
    clear: string;
    noErrors: string;
    noState: string;
    passage: string;
  };

  stats: {
    sectionOverview: string;
    sectionFlow: string;
    sectionEntities: string;
    sectionBlocks: string;
    words: string;
    readingTime: string;
    minutes: (n: number) => string;
    scenes: string;
    systemScenes: string;
    groups: string;
    totalBlocks: string;
    choices: string;
    links: string;
    endings: string;
    unreachable: string;
    branching: string;
    characters: string;
    items: string;
    containers: string;
    variables: string;
    watchers: string;
    plugins: string;
    assets: string;
    perScene: string;
    empty: string;
    refresh: string;
    notComputed: string;
    stale: string;
  };

  questSetBlock: {
    quest: string;
    selectQuest: string;
    parentState: string;
    keep: string;
    noQuests: string;
  };

  questShowBlock: {
    filterStates: string;
    defaultStates: string;
    filterCategories: string;
    showDescription: string;
    showSteps: string;
    live: string;
  };

  quests: {
    add: string;
    empty: string;
    noName: string;
    defaultName: string;
    confirmDelete: (n: string) => string;
    categories: string;
    addCategory: string;
    newCategory: string;
    createTitle: string;
    editTitle: string;
    sectionBasics: string;
    sectionStructure: string;
    name: string;
    description: string;
    category: string;
    noCategory: string;
    initialState: string;
    composite: string;
    ordered: string;
    orderedHint: string;
    autoComplete: string;
    stepName: string;
    addStep: string;
    create: string;
    save: string;
    cancel: string;
    stateHidden: string;
    stateActive: string;
    stateDone: string;
    stateFailed: string;
  };

  replace: {
    title:              string;
    find:               string;
    replaceWith:        string;
    findPlaceholder:    string;
    replacePlaceholder: string;
    regexLabel:         string;
    caseLabel:          string;
    scopeScene:         string;
    scopeProject:       string;
    invalidRegex:       string;
    matchCount:         (n: number, fields: number) => string;
    noMatches:          string;
    replaceBtn:         string;
    done:               (n: number) => string;
  };

  scene: {
    add: string;
    drag: string;
    rename: string;
    duplicate: string;
    delete: string;
    confirmDelete: (name: string) => string;
    label: string;
    tags: string;
    noTags: string;
    tagsPlaceholder: string;
    editTagsTitle: string;
    collapseAll: string;
    expandAll: string;
    translateScene: string;
    stopTranslate: string;
    translateSceneConfirm: string;
    translateSceneEmpty: string;
    translating: (n: number, total: number) => string;
    translateDone: (n: number) => string;
    translateFailed: string;
    empty: string;
    /** Hint banner: ::StoryMenu renders only <<link>> items. */
    menuSceneHint: string;
    /** Hint banner: ::StoryTitle is the UI-bar title (text / image). */
    titleSceneHint: string;
    selectPrompt: string;
    note: string;
    notePlaceholder: string;
    filterNoScenes: string;
    createTitle: string;
    editTitle: string;
    fieldName: string;
    nameTaken: string;
    nameEmpty: string;
    addGroup: string;
    groupCreateTitle: string;
    groupEditTitle: string;
    groupFieldName: string;
    groupNameTaken: string;
    groupNameEmpty: string;
    groupConfirmDelete: (name: string) => string;
    groupCannotDeleteStart: string;
    groupUngrouped: string;
    makeStart: string;
    startTagHint: string;
    /** Text BEFORE the inline <code>{canonical}</code> chip */
    nameLockedPrefix: string;
    /** Text AFTER the chip, includes the tag — ". Remove the «<tag>» tag below to rename." */
    nameLockedSuffix: (tag: string) => string;
    /** Title attr on the locked name input */
    nameLockedTitle: (canonical: string) => string;
    tabSettings: string;
    tabBackground: string;
    tabSystem: string;
    bgNone: string;
    bgStatic: string;
    bgBound: string;
    bgAiStatic: string;
    bgAiBound: string;
    bgSection: string;
    bgHint: string;
    bgBlur: string;
    bgOpacity: string;
    bgSize: string;
    bgSizeCover: string;
    bgSizeContain: string;
    bgSizeFill: string;
    bgPosX: string;
    bgPosY: string;
    bgOverlayColor: string;
    bgOverlayOpacity: string;
    bgNoImage: string;
    bgGenerate: string;
    bgRemove: string;
    bgVariable: string;
    bgDisplaySection: string;
    bgOverlaySection: string;
    bgColorSection: string;
  };

  // ─── Style override editor (shared, used in CharacterModal / DialogueBlockEditor / ProjectSettings) ──
  styleOverride: {
    sectionTitle: string;          // "Custom style"
    enable: string;                // "Override style"
    enableNote: string;            // small explainer near the toggle
    modeStatic: string;            // "Static"
    modeBound: string;             // "Bound to variable"
    modeBoundNote: string;         // explainer for bound mode
    fieldsHeader: string;          // "Style fields"
    rawCssLabel: string;           // "Additional CSS"
    rawCssPlaceholder: string;     // generic fallback textarea placeholder
    placeholderDialogue: string;   // textarea placeholder for dialogue overrides
    placeholderButton: string;     // textarea placeholder for button/link/function overrides
    placeholderContent: string;    // placeholder for text/image/include/checkbox/radio/input
    placeholderDivider: string;    // placeholder for divider
    rawCssScopedNote: string;      // hint that rules are auto-scoped
    rawCssHelpToggle: string;      // "Show supported selectors & example"
    rawCssHelpIntro: string;       // intro line for help block
    rawCssDisclaimer: string;      // "Any valid CSS works ..." — emphasises no whitelist
    rawCssCheatsheetTitle: string; // "Common properties"
    rawCssCheatsheet: {
      motion:      string;         // "Motion & animation"
      effects:     string;         // "Visual effects"
      layout:      string;         // "Layout & spacing"
      interaction: string;         // "Interaction"
    };
    rawCssExampleLabel: string;    // "Example:"
    bindVariableLabel: string;     // "Variable (number)"
    bindVariableEmpty: string;     // "Pick a numeric variable"
    variants: string;              // "Variants"
    variantAdd: string;            // "+ Variant"
    variantEmpty: string;          // shown when list is empty
    variantMatchExact: string;     // "Exact"
    variantMatchRange: string;     // "Range"
    variantMatchValue: string;     // "Value"
    variantMatchMin: string;       // "From"
    variantMatchMax: string;       // "To"
    variantConditionHint: string;  // "first match wins"
    variantDefault: string;        // "Default (no match)"
    variantDefaultNote: string;    // explainer
    reset: string;                 // "Reset"
    // Tristate UI labels (boolean fields: bold / fullWidth)
    tristateUnset: string;         // "—" (let lower cascade layer through)
    tristateOff: string;
    tristateOn: string;
    // Field labels — keyed by StyleFieldDescriptor.labelKey
    fields: {
      bgColor:      string;
      borderColor:  string;
      nameColor:    string;
      textColor:    string;
      borderRadius: string;
      paddingV:     string;
      paddingH:     string;
      fontSize:     string;
      bold:         string;
      fullWidth:    string;
      // Content-block specific
      borderWidth:  string;
      maxWidth:     string;
      opacity:      string;
      // Divider specific
      lineColor:    string;
      thickness:    string;
      marginV:      string;
      // Media-block specific
      align:        string;
      borderTarget: string;
      // Choice-specific
      direction:    string;
      gap:          string;
      // Popup-specific
      titlebarBg:   string;
      titleColor:   string;
      // Tabs-specific (active tab variants)
      activeBgColor:     string;
      activeTextColor:   string;
      activeBorderColor: string;
      activeBold:        string;
      // DisplayObject-specific
      labelColor:        string;
      valueColor:        string;
      barColor:          string;
      barEmptyColor:     string;
    };
    // Enum option labels — keyed by StyleFieldDescriptor.options[i].labelKey
    options: {
      alignLeft:            string;
      alignCenter:          string;
      alignRight:           string;
      borderTargetContent:  string;
      borderTargetWrapper:  string;
      directionRow:         string;
      directionColumn:      string;
    };
    // Raw-CSS help selector descriptions — keyed by StyleRawCssHelp.selectors[i].descKey
    selectors: {
      selectorBody:           string;
      selectorName:           string;
      selectorText:           string;
      selectorAvatar:         string;
      selectorButtonA:        string;
      selectorButtonAHover:   string;
      selectorButtonAActive:  string;
      // Simple-block selectors
      selectorBlockSelf:      string;
      selectorBlockImg:       string;
      selectorBlockVideo:     string;
      selectorBlockInput:     string;
      selectorBlockLabel:     string;
      // Choice
      selectorChoiceA:        string;
      // Popup (#ui-dialog)
      selectorPopupDialog:    string;
      selectorPopupTitlebar:  string;
      selectorPopupTitle:     string;
      selectorPopupBody:      string;
      selectorPopupClose:     string;
      // Tabs
      selectorTabsItem:       string;       // each tab anchor
      selectorTabsActive:     string;       // active tab anchor
      // DisplayObject
      selectorDoRow:          string;
      selectorDoLabel:        string;
      selectorDoValue:        string;
      selectorDoBar:          string;
      selectorDoBarFill:      string;
      selectorDoCard:         string;
      selectorDoBadge:        string;
    };
    // Block-specific raw-CSS placeholders (used by StyleRawCssHelp.placeholderKey)
    placeholderChoice?:        string;
    placeholderPopup?:         string;
    placeholderTabs?:          string;
    placeholderDisplayObject?: string;
  };

  block: {
    /** Block type display names */
    text: string;
    dialogue: string;
    choice: string;
    condition: string;
    variableSet: string;
    setObject: string;
    forLoop: string;
    button: string;
    link: string;
    menuLink: string;
    inputField: string;
    image: string;
    imageGen: string;
    video: string;
    raw: string;
    note: string;
    spacer: string;
    table: string;
    include: string;
    divider: string;
    checkbox: string;
    radio: string;
    function: string;
    popup: string;
    audio: string;
    audioGen: string;
    container: string;
    timeManipulation: string;
    paperdoll: string;
    inventory: string;
    tabs: string;
    section: string;
    progress: string;
    audioVolume: string;
    dateTime: string;
    callout: string;
    save: string;
    questSet: string;
    questShow: string;
    select: string;
    slider: string;
    displayObject: string;
    plugin: string;
    /** Action tooltips / labels */
    drag: string;
    copy: string;
    duplicate: string;
    delete: string;
    collapse: string;
    expand: string;
    paste: (typeName: string) => string;
    unsupportedNested: string;
  };

  addBlock: {
    trigger: string;
    cancel: string;
    search: string;
    recent: string;
    categories: {
      narrative: string;
      media: string;
      layout: string;
      game: string;
      quests: string;
      data: string;
      interaction: string;
      logic: string;
      system: string;
      plugins: string;
    };
    text:        { label: string; desc: string };
    dialogue:    { label: string; desc: string };
    choice:      { label: string; desc: string };
    condition:   { label: string; desc: string };
    variableSet: { label: string; desc: string };
    setObject:   { label: string; desc: string };
    forLoop:     { label: string; desc: string };
    button:      { label: string; desc: string };
    link:        { label: string; desc: string };
    menuLink:    { label: string; desc: string };
    inputField:  { label: string; desc: string };
    image:       { label: string; desc: string };
    imageGen:    { label: string; desc: string };
    video:       { label: string; desc: string };
    raw:         { label: string; desc: string };
    note:        { label: string; desc: string };
    spacer:      { label: string; desc: string };
    table:       { label: string; desc: string };
    include:     { label: string; desc: string };
    divider:     { label: string; desc: string };
    checkbox:    { label: string; desc: string };
    radio:       { label: string; desc: string };
    function:    { label: string; desc: string };
    popup:       { label: string; desc: string };
    audio:       { label: string; desc: string };
    audioGen:    { label: string; desc: string };
    container:   { label: string; desc: string };
    questSet:    { label: string; desc: string };
    questShow:   { label: string; desc: string };
    timeManipulation: { label: string; desc: string };
    paperdoll:        { label: string; desc: string };
    inventory:        { label: string; desc: string };
    tabs:             { label: string; desc: string };
    section:          { label: string; desc: string };
    progress:         { label: string; desc: string };
    audioVolume:      { label: string; desc: string };
    dateTime:         { label: string; desc: string };
    callout:          { label: string; desc: string };
    save:             { label: string; desc: string };
    select:           { label: string; desc: string };
    slider:           { label: string; desc: string };
    displayObject:    { label: string; desc: string };
  };

  // ─── TabsBlock editor ───────────────────────────────────────────────────────
  tabsBlock: {
    addTab: string;          // "+ Tab"
    moveLeft: string;        // "Move left"
    moveRight: string;       // "Move right"
    emptyTab: string;        // "No blocks in this tab."
    defaultTab: string;      // "Default tab:"
    bindVariable: string;    // "Bind to variable:"
    autoVarPlaceholder: string; // "(auto)"
  };

  // ─── Sidebar (UIBar) systemConfig panel ─────────────────────────────────────
  sidebarConfig: {
    sectionTitle: string;
    sectionNote: string;     // "These settings control the wrapper of ::StoryCaption…"
    fromVariable: string;    // generic "From variable" pill
    // Hide
    hideEntirely: string;
    visibleDefault: string;
    hiddenStatic: string;
    // Width
    width: string;
    widthDefault: string;
    custom: string;
    // Position
    position: string;
    leftDefault: string;
    right: string;
    positionVarHint: string;
    // Start collapsed
    startCollapsed: string;
    openDefault: string;
    startCollapsedHelp: string;
    // Allow collapse
    allowCollapse: string;
    allowDefault: string;
    hideToggleButton: string;
    // Background color
    bgColor: string;
    themeDefault: string;
    // Typography & spacing
    sectionTypography: string;
    textColor: string;
    fontFamily: string;
    fontFamilyPlaceholder: string;
    fontSize: string;
    padding: string;
    blockGap: string;
    sizeDefault: string;
    selectStringVar: string;
    // History nav + saves
    historyNav: string;
    saveLoadMenu: string;
    onDefault: string;
    alwaysOff: string;
    // Picker placeholders
    selectBoolVar: string;
    selectNumberVar: string;
    selectColorVar: string;
    selectPositionVar: string;
  };

  // ─── System scene group (SceneList top section) ─────────────────────────────
  systemGroup: {
    title: string;            // "System"
    createSidebar: string;    // "+ Sidebar scene"
    createSidebarTooltip: string; // hover hint
    createTitle: string;      // "+ Title scene"
    createTitleTooltip: string;
    createMenu: string;       // "+ Menu scene"
    createMenuTooltip: string;
    createPassageHeader: string;  // "+ Passage header"
    createPassageHeaderTooltip: string;
    createPassageFooter: string;  // "+ Passage footer"
    createPassageFooterTooltip: string;
  };

  // ─── Title (StoryTitle) systemConfig panel ──────────────────────────────────
  titleConfig: {
    sectionTitle: string;     // "Title (StoryTitle) settings"
    sectionNote: string;      // explanation
    textColor: string;
    font: string;
    fontPlaceholder: string;
  };

  pluginBlock: {
    editPlugin: string;
    editPluginTooltip: string;
    notFound: string;
    noParams: string;
  };

  pluginEditor: {
    title: string;
    newPlugin: string;
    metaSection: string;
    paramsSection: string;
    blocksSection: string;
    name: string;
    icon: string;
    color: string;
    description: string;
    version: string;
    addParam: string;
    paramKey: string;
    paramLabel: string;
    paramDefault: string;
    moveUp: string;
    moveDown: string;
    noParams: string;
    paramsHint: string;
    blocksHint: string;
    noBlocks: string;
    unsupportedBlockType: string;
    save: string;
    delete: string;
    confirmDelete: string;
    savedToast: string;
    deletedToast: string;
    kind_text: string;
    kind_number: string;
    kind_bool: string;
    kind_array: string;
    kind_datetime: string;
    kind_object: string;
    kind_scene: string;
    objectFields: string;
    objectFieldsNone: string;
    validationNameRequired: string;
    validationKeyInvalid: string;
    validationKeyDuplicate: string;
  };

  pluginManager: {
    newPlugin: string;
    importPlugin: string;
    exportPlugin: string;
    duplicatePlugin: string;
    empty: string;
    errorLoading: string;
    confirmDelete: (name: string) => string;
  };

  includeBlock: {
    passageLabel:       string;
    passagePlaceholder: string;
    maxWidthLabel:      string;
    maxWidthSuffix:     string;  // 'px' / '(0 = авто)'
    borderedLabel:      string;
    borderColorLabel:   string;
    thicknessSuffix:    string;  // 'px'
    radiusSuffix:       string;  // 'px'
    paddingLabel:       string;
    paddingSuffix:      string;  // 'px'
    bgColorLabel:       string;
  };

  condition: {
    addBranch: string;
    addElse: string;
    noBranches: string;
    varPlaceholder: string;
    valuePlaceholder: string;
    rangeToggle:         string;  // tooltip for range-mode button
    rangeMinPlaceholder: string;
    rangeMaxPlaceholder: string;
    rawExpressionPlaceholder: string;
    toRaw:                   string;
    toStructured:            string;
    opContains:    string;  // 'contains'
    opNotContains: string;  // '!contains'
    opEmpty:       string;  // 'empty'
    opNotEmpty:    string;  // '!empty'
  };

  header: {
    searchPlaceholder: string;
    clearSearch: string;
    undo: string;
    undoTitle: string;
    redo: string;
    redoTitle: string;
    renameProjectTitle: string;
    open: string;
    openTitle: string;
    new: string;
    confirmNew: string;
    save: string;
    saving: string;
    saveTitle: (dir: string) => string;
    saveNoDir: string;
    saveMoreOptions: string;
    saveAsFolder: string;
    saveAsFolderDesc: string;
    openFolder: string;
    openFolderDesc: string;
    scRuntime: string;
    scLoaded: (version: string) => string;
    scLoadTitle: string;
    confirmClearSC: string;
    exportTwee: string;
    exportTweeTitle: string;
    exportHtml: string;
    exportMoreOptions: string;
    exportSaveInFolder: string;
    exportSaveInFolderDesc: string;
    exportSaveAs: string;
    exportSaveAsDesc: string;
    confirmHtmlSaved: string;
    language: string;
    previewCode: string;
    previewCodeTitle: string;
    previewCodeClose: string;
    graph: string;
    graphTitle: string;
    graphClose: string;
    play: string;
    playTitle: string;
    playClose: string;
    errorSave: (e: unknown) => string;
    errorInvalidProject: string;
    dialogSelectSC: string;
    errorInvalidSC: string;
    scLoadedAlert: (version: string) => string;
    errorReadFile: (e: unknown) => string;
    errorExportHtml: (e: unknown) => string;
    dialogSaveHtml: string;
    errorExportTwee: (e: unknown) => string;
    dialogSaveTwee: string;
    menuTitle: string;
    menuSectionFile: string;
    menuSectionSettings: string;
    newDesc: string;
    closeConfirmTitle: string;
    closeConfirmMessage: string;
    closeConfirmSaveMessage: string;
    closeConfirmSaveAndExit: string;
    closeConfirmExit: string;
    projectSettings: string;
    projectSettingsDesc: string;
    editorPrefs: string;
    editorPrefsDesc: string;
    llmSettings: string;
    llmSettingsDesc: string;
    about: string;
    aboutDesc: string;
    aboutVersion: (v: string) => string;
    successSave: string;
    successExportHtml: string;
    successExportTwee: string;
    unapprovedImagesTitle: string;
    unapprovedImagesMessage: (scenes: string[]) => string;
    importFromTwee: string;
    importFromTweeDesc: string;
    dialogImportTwee: string;
    errorImport: (e: unknown) => string;
    successImport: string;
  };

  graphView: {
    legendTitle: string;
    refresh: string;
    stale: string;
    kinds: {
      choice: string;
      link: string;
      menuLink: string;
      function: string;
      popup: string;
      openPopup: string;
      include: string;
    };
  };

  importSummary: {
    title: string;
    intro: string;
    format: (name: string) => string;
    scenes: (n: number) => string;
    blocksTotal: (n: number) => string;
    rawBlocks: (n: number) => string;
    blocksBreakdown: string;
    variables: (n: number) => string;
    variablesTodo: (n: number) => string;
    variablesAutoCreated: (n: number) => string;
    customCss: (bytes: string) => string;
    customScript: (bytes: string) => string;
    warningsTitle: string;
    cancel: string;
    openProject: string;
  };

  // ─── Asset manager ──────────────────────────────────────────────────────────
  assets: {
    errorCreateFolder: (e: unknown) => string;
    titleSelectFiles: string;
    filterMedia: string;
    filterImages: string;
    filterVideos: string;
    errorAddFiles: (e: unknown) => string;
    groupNamePlaceholder: string;
    addGroupTitle: string;
    addGroup: string;
    addFilesRootTitle: string;
    addFiles: string;
    empty: string;
    addSubgroupTitle: string;
    addFilesToGroupTitle: string;
    deleteGroupTitle: string;
    confirmDeleteGroup: (name: string) => string;
    emptyGroup: string;
    videoTitle: string;
    removeTitle: string;
    confirmDeleteFile: (name: string) => string;
    filterAudio: string;
    audioTitle: string;
    refresh: string;
  };

  // ─── Asset info modal ──────────────────────────────────────────────────────
  assetInfo: {
    loading: string;
    fileSize: string;
    dimensions: string;
    duration: string;
    bitrate: string;
    path: string;
  };

  // ─── Characters ─────────────────────────────────────────────────────────────
  characters: {
    defaultName: string;
    confirmDelete: (name: string) => string;
    empty: string;
    add: string;
    noName: string;
    fieldName: string;
    fieldVarName: string;
    varNameHint: string;
    varNameInvalid: string;
    varNameTaken: string;
    varNameEmpty: string;
    fieldNameColor: string;
    fieldDialogBg: string;
    fieldAccent: string;
    fieldTextColor: string;
    exampleLine: string;
    avatarLabel: string;
    avatarStatic: string;
    avatarDynamic: string;
    fieldImage: string;
    fieldVariable: string;
    selectVariable: string;
    mappingsLabel: string;
    addMapping: string;
    noMappings: string;
    defaultMapping: string;
    createTitle: string;
    editTitle: string;
    save: string;
    nameTaken: string;
    nameEmpty: string;
    customVarsSection: string;
    customVarsAdd: string;
    customVarsNamePlaceholder: string;
    customVarsEmpty: string;
    customVarsNameEmpty: string;
    customVarsConfirmDelete: (name: string) => string;
    initialInventorySection: string;
    initialInventoryAdd: string;
    initialInventoryEmpty: string;
    initialInventoryQty: string;
    initialInventoryEquipped: string;
    initialInventoryNoItems: string;
    isHero: string;
    heroTooltip: string;
    paperdollSection: string;
    paperdollAddSlot: string;
    paperdollNoSlots: string;
    paperdollSlotLabel: string;
    paperdollSlotId: string;
    paperdollRowLabel: string;
    paperdollColLabel: string;
    paperdollGridCols: string;
    paperdollGridRows: string;
    paperdollCellSize: string;
    paperdollDefaultItem: string;
    paperdollDefaultItemNone: string;
    paperdollSlotClickable: string;
    paperdollPlaceholderIcon: string;
    paperdollPlaceholderStatic: string;
    paperdollPlaceholderBound: string;
    paperdollPlaceholderSelectVar: string;
    paperdollConfirmDelete: (label: string) => string;
  };

  // ─── Variables ──────────────────────────────────────────────────────────────
  variables: {
    groupNamePlaceholder: string;
    addVariable: string;
    addGroup: string;
    empty: string;
    confirmDeleteGroup: (name: string) => string;
    confirmDeleteVar: (name: string) => string;
    fieldName: string;
    fieldType: string;
    fieldDefault: string;
    fieldDescription: string;
    typeNumber: string;
    typeString: string;
    typeBoolean: string;
    typeArray: string;
    typeDateTime: string;
    defaultPlaceholderNumber: string;
    defaultPlaceholderText: string;
    descriptionPlaceholder: string;
  };

  // ─── Shared: cell edit modal (Panel + Table) ────────────────────────────────
  cellModal: {
    title: string;
    contentType: string;
    done: string;
    selectVariable: string;
    selectAsset: string;
    prefix: string;
    suffix: string;
    maximum: string;
    colorRange: string;
    colorRangeOff: string;
    colorAt0: string;
    colorAt100: string;
    fillColor: string;
    barBgColor: string;
    textColor: string;
    inherited: string;
    vertical: string;
    showNumbers: string;
    imageLabel: string;
    objectFit: string;
    fitCover: string;
    fitContain: string;
    mappingsLabel: string;
    addMapping: string;
    matchMode: string;
    matchExact: string;
    matchRange: string;
    valueLabel: string;
    fromLabel: string;
    toLabel: string;
    fileLabel: string;
    defaultLabel: string;
    rawCodeLabel: string;
    typeText: string;
    typeVariable: string;
    typeProgress: string;
    typeImageStatic: string;
    typeImageBound: string;
    typeImageBoundShort: string;
    typeRaw: string;
    typeInclude: string;
    includeSceneLabel: string;
    includeScenePicker: string;
    typeButton: string;
    // ── Button cell fields ──
    buttonLabelField: string;
    buttonActionsTitle: string;
    buttonAddAction: string;
    buttonNoActions: string;
    buttonDeleteAction: string;
    buttonSelectVariable: string;
    buttonTextPlaceholder: string;
    buttonNavigateTitle: string;
    buttonTargetNone: string;
    buttonTargetScene: string;
    buttonTargetBack: string;
    buttonSceneLabel: string;
    buttonNoScene: string;
    // ── List cell fields ──
    typeList: string;
    listVariableLabel: string;
    listSeparatorLabel: string;
    listEmptyTextLabel: string;
    listPrefixLabel: string;
    listSuffixLabel: string;
    // ── Audio volume cell fields ──
    typeAudioVolume: string;
    audioVolumeMuteButton: string;
    // ── New image cell types ──
    typeImageGen: string;
    typeImageGenShort: string;
    typeImageFromVar: string;
    typeImageFromVarShort: string;
    openImageBoundGen: string;
    variableLabel: string;
    // ── Date/Time cell fields ──
    typeDateTime: string;
    displayModeLabel: string;
    displayModeText: string;
    displayModeClock: string;
    displayModeDigital: string;
    displayModeCalendar: string;
    displayModeClockCalendar: string;
    displayModeDigitalCalendar: string;
    fmtTime: string;
    fmtDate: string;
    fmtDateTime: string;
    fmtWeekday: string;
    fmtWeekdayTime: string;
    fmtWeekdayDate: string;
    fmtWeekdayFull: string;
    fmtMonthYear: string;
    fmtCustom: string;
    // ── Paperdoll cell fields ──
    typePaperdoll: string;
    paperdollCharLabel: string;
    paperdollShowLabels: string;
    paperdollNoChar: string;
  };

  // ─── Shared: rows/cells editor UI (Panel + Table) ──────────────────────────
  rowsEditor: {
    sectionTitle: string;
    noRows: string;
    rowLabel: (n: number) => string;
    heightLabel: string;
    confirmDeleteRow: string;
    noCells: string;
    addCell: string;
    addRow: string;
    equalWidth: string;
    equalWidthTitle: string;
    editTitle: string;
    deleteTitle: string;
    cellTextPlaceholder: string;
    cellCodePlaceholder: string;
    cellEmpty: string;
    cellBlockCount: (n: number) => string;
  };

  // ─── Shared: style editor (Panel + Table) ──────────────────────────────────
  tableStyle: {
    title: string;
    rowGap: string;
    borders: string;
    outerBorder: string;
    betweenRows: string;
    betweenCells: string;
    thickness: string;
    borderColor: string;
  };

  // ─── Block editors ──────────────────────────────────────────────────────────
  textBlock: {
    placeholder: string;
    liveUpdateLabel: string;
    liveUpdateDesc: string;
  };

  dialogueBlock: {
    characterLabel: string;
    noCharacters: string;
    selectChar: string;
    sideLabel: string;
    sideLeft: string;
    sideRight: string;
    liveUpdateLabel: string;
    liveUpdateDesc: string;
    dynamicAvatarTitle: string;
    linePlaceholder: string;
    innerBlocksLabel: string;
    nameSuffixLabel: string;
    nameSuffixPlaceholder: string;
  };

  choiceBlock: {
    defaultOption: string;
    empty: string;
    optionPlaceholder: string;
    deleteOption: string;
    targetScene: string;
    noScene: string;
    conditionLabel: string;
    conditionPlaceholder: string;
    addOption: string;
  };

  imageBlock: {
    noAssetOption: string;
    modeLabel: string;
    modeStatic: string;
    modeBound: string;
    assetLabel: string;
    selectAsset: string;
    urlLabel: string;
    urlPlaceholder: string;
    variableLabel: string;
    selectVariable: string;
    mappingsLabel: string;
    addMapping: string;
    noMappings: string;
    matchMode: string;
    matchExact: string;
    matchRange: string;
    valueLabel: string;
    fromLabel: string;
    toLabel: string;
    fileLabel: string;
    defaultLabel: string;
    altLabel: string;
    altPlaceholder: string;
    widthLabel: string;
    widthPlaceholder: string;
  };

  imageGenBlock: {
    providerLabel: string;
    providerComfyui: string;
    providerPollinations: string;
    providerUrlLabel: string;
    pollinationsModelLabel: string;
    pollinationsModelPlaceholder: string;
    pollinationsTokenLabel: string;
    pollinationsTokenPlaceholder: string;
    workflowLabel: string;
    workflowNone: string;
    workflowRefresh: string;
    workflowGroupExamples: string;
    workflowGroupProject: string;
    workflowGroupCustom: string;
    promptModeLabel: string;
    promptModeManual: string;
    promptModeLlm: string;
    promptLabel: string;
    promptPlaceholder: string;
    negativePromptLabel: string;
    negativePromptPlaceholder: string;
    seedModeLabel: string;
    seedModeManual: string;
    seedModeRandom: string;
    seedLabel: string;
    seedPlaceholder: string;
    llmGeneratePrompt: string;
    llmGenerating: string;
    generateImage: string;
    generatingImage: string;
    historyLabel: string;
    historyEmpty: string;
    currentImageLabel: string;
    widthLabel: string;
    widthPlaceholder: string;
    altLabel: string;
    altPlaceholder: string;
    genWidthLabel: string;
    genWidthPlaceholder: string;
    genHeightLabel: string;
    genHeightPlaceholder: string;
    genSizeLabel: string;
    cancelGeneration: string;
    clearHistory: string;
    clearHistoryConfirm: string;
    approveImage: string;
    approveImageTitle: string;
    unapproveImage: string;
    unapproveImageTitle: string;
    approvedBadge: string;
    draftBadge: string;
    doubleClickToExpand: string;
    approveSaveTitle: string;
    approveFolderLabel: string;
    approveFilenameLabel: string;
    approveSaveButton: string;
    approveOutsideRelease: string;
    errorApprove: string;
    errorUnapprove: string;
    llmModeContinue: string;
    llmModeRephrase: string;
    llmModeHint: string;
    styleHintsLabel: string;
    styleHintsCustomPlaceholder: string;
    styleHintsAddBtn: string;
    errorNoProjectDir: string;
    errorNoWorkflow: string;
    errorNoPrompt: string;
    errorGeneratePrompt: string;
    errorGenerateImage: string;
  };

  avatarGen: {
    modalTitleStatic: string;
    modalTitleDynamic: string;
    generateBtn: string;
    providerLabel: string;
    providerComfyui: string;
    providerPollinations: string;
    providerUrlLabel: string;
    workflowLabel: string;
    workflowNone: string;
    workflowRefresh: string;
    workflowGroupExamples: string;
    workflowGroupProject: string;
    workflowGroupCustom: string;
    pollinationsModelLabel: string;
    pollinationsModelPlaceholder: string;
    pollinationsTokenLabel: string;
    pollinationsTokenPlaceholder: string;
    genSizeLabel: string;
    genWidthPlaceholder: string;
    genHeightPlaceholder: string;
    slotLabelStatic: string;
    slotLabelDefault: string;
    promptLabel: string;
    promptPlaceholder: string;
    negativePromptLabel: string;
    negativePromptPlaceholder: string;
    generatePromptBtn: string;
    generatingPrompt: string;
    generateImageBtn: string;
    generatingImage: string;
    cancelBtn: string;
    historyLabel: string;
    historyEmpty: string;
    approveAllBtn: string;
    approveSuccess: string;
    approvedBadge: string;
    doubleClickToExpand: string;
    llmModeContinue: string;
    llmModeRephrase: string;
    llmModeHint: string;
    styleHintsLabel: string;
    styleHintsCustomPlaceholder: string;
    styleHintsAddBtn: string;
    seedLabel: string;
    seedLock: string;
    seedRandomize: string;
    refImageCheckbox: string;
    refImageTooltip: string;
    fromAssetsLabel: string;
    hintLabel: string;
    hintPlaceholder: string;
    generateFromHintBtn: string;
    generateFromHintNoRef: string;
    errorNoProjectDir: string;
    errorNoWorkflow: string;
    errorNoPrompt: string;
    errorGenerateImage: string;
    errorGeneratePrompt: string;
    errorApprove: string;
  };

  // ─── Item icon generation modal (overrides for item context) ───────────────
  itemIconGen: {
    promptPlaceholder: string;
    hintPlaceholder: string;
    generateFromHintNoRef: string;
    approveSuccess: string;
    errorApprove: string;
  };

  // ─── Paperdoll slot generation modal (overrides for paperdoll-slot context) ──
  paperdollSlotGen: {
    promptPlaceholder: string;
    hintPlaceholder: string;
    generateFromHintNoRef: string;
    approveSuccess: string;
    errorApprove: string;
  };

  // ─── Container background generation modal (overrides for container context) ─
  containerGen: {
    promptPlaceholder: string;
    hintPlaceholder: string;
    generateFromHintNoRef: string;
    approveSuccess: string;
    errorApprove: string;
  };

  // ─── Cell image-bound generation modal (overrides for non-avatar context) ───
  cellBoundGen: {
    modalTitle: string;
    promptPlaceholder: string;
    hintPlaceholder: string;
    generateFromHintNoRef: string;
    approveSuccess: string;
    errorApprove: string;
  };

  videoBlock: {
    assetLabel: string;
    selectAsset: string;
    urlLabel: string;
    urlPlaceholder: string;
    widthLabel: string;
    widthPlaceholder: string;
    controls: string;
    autoplay: string;
    loop: string;
  };

  audioBlock: {
    assetLabel: string;
    selectAsset: string;
    urlLabel: string;
    urlPlaceholder: string;
    triggerLabel: string;
    triggerImmediate: string;
    triggerDelay: string;
    seconds: string;
    onLeaveLabel: string;
    onLeaveStop: string;
    onLeavePersist: string;
    loop: string;
    stopOthers: string;
    stopOthersHint: string;
    volumeLabel: string;
  };

  audioGenBlock: {
    workflowLabel: string;
    workflowRefresh: string;
    durationLabel: string;
    durationPlaceholder: string;
    bpmLabel: string;
    bpmPlaceholder: string;
    promptModeManual: string;
    promptModeLlm: string;
    stylePromptLabel: string;
    stylePromptPlaceholder: string;
    stylePromptHint: string;
    lyricsModeLabel: string;
    lyricsLabel: string;
    lyricsPlaceholder: string;
    lyricsHint: string;
    tagsLabel: string;
    tagsCustomPlaceholder: string;
    tagsAddBtn: string;
    tagsCategoryGenre: string;
    tagsCategoryVocals: string;
    tagsCategoryInstruments: string;
    tagsCategoryMoodTempo: string;
    llmGenerating: string;
    llmModeContinue: string;
    llmModeRephrase: string;
    llmModeHint: string;
    llmModeFormatAce: string;
    generateAudio: string;
    generatingAudio: string;
    cancelGeneration: string;
    historyLabel: string;
    historyEmpty: string;
    clearHistory: string;
    clearHistoryConfirm: string;
    approveAudio: string;
    approveAudioTitle: string;
    unapproveAudio: string;
    unapproveAudioTitle: string;
    approvedBadge: string;
    draftBadge: string;
    approveSaveTitle: string;
    approveFolderLabel: string;
    approveFilenameLabel: string;
    approveSaveButton: string;
    approveOutsideRelease: string;
    playbackSection: string;
    errorApprove: string;
    errorUnapprove: string;
    errorNoProjectDir: string;
    errorNoWorkflow: string;
    errorNoPrompt: string;
    errorGenerateFormatStyle: string;
    errorGenerateLyrics: string;
    errorGenerateAudio: string;
    // ── Composed-payload debug preview ────────────────────────────────────
    composedPreviewLabel: string;
    composedPreviewEmpty: string;
    composedPreviewTagsLabel: string;
    composedPreviewLyricsLabel: string;
    composedPreviewSeedLabel: string;
    composedPreviewDurationLabel: string;
    composedPreviewBpmLabel: string;
    // ── Error modal ───────────────────────────────────────────────────────
    errorModalCopyDetails: string;
    errorModalCopied: string;
    errorModalClose: string;
    errorModalTechnicalDetails: string;
    errorModalHintsHeader: string;
    errorHintNetwork: string;
    errorHintWorkflow400: string;
    errorHintExecution: string;
    errorHintNoOutput: string;
    errorHintTimeout: string;
    errorHintGeneric: string;
    // Short category labels — appear as a banner above the raw error
    errorCategoryNetwork: string;
    errorCategoryWorkflow400: string;
    errorCategoryExecution: string;
    errorCategoryNoOutput: string;
    errorCategoryTimeout: string;
    errorCategoryGeneric: string;
  };

  linkBlock: {
    labelField: string;
    labelPlaceholder: string;
    targetLabel: string;
    targetScene: string;
    targetBack: string;
    sceneLabel: string;
    noScene: string;
    actionsTitle: string;
    addAction: string;
    noActions: string;
    deleteAction: string;
    selectVariable: string;
    textPlaceholder: string;
    navigateTitle: string;
  };

  menuLinkBlock: {
    hint: string;
    labelField: string;
    labelPlaceholder: string;
    targetLabel: string;
    targetScene: string;
    targetBack: string;
    targetSaves: string;
    targetRestart: string;
    targetSettings: string;
    targetNone: string;
    sceneLabel: string;
    noScene: string;
    builtinHint: string;
    actionsTitle: string;
  };

  buttonBlock: {
    styleTitle: string;
    bgLabel: string;
    textColorLabel: string;
    borderLabel: string;
    radiusLabel: string;
    paddingLabel: string;
    fontSizeLabel: string;
    bold: string;
    fullWidth: string;
    previewTitle: string;
    defaultButtonLabel: string;
    selectVariable: string;
    textPlaceholder: string;
    deleteAction: string;
    labelField: string;
    labelPlaceholder: string;
    actionsTitle: string;
    addAction: string;
    noActions: string;
    refreshScene: string;
  };

  inputFieldBlock: {
    labelField: string;
    labelPlaceholder: string;
    variableLabel: string;
    noVariable: string;
    selectVariable: string;
    defaultNumber: string;
    defaultText: string;
    defaultNumberPlaceholder: string;
    defaultTextPlaceholder: string;
    booleanNotSupported: string;
    generated: string;
  };

  rawBlock: {
    hint: string;
    recognizeButton: string;
    recognizeTitle: string;
    recognizeNothing: string;
    recognizeSuccess: (n: number) => string;
  };

  setObject: {
    varPlaceholder: string;
    keyPlaceholder: string;
    valuePlaceholder: string;
    addEntry: string;
    removeEntry: string;
    pickVariableHint: string;
  };

  forBlock: {
    bodyLabel: string;
  };

  dividerBlock: {
    colorLabel: string;
    thicknessLabel: string;
    thicknessSuffix: string;
    marginLabel: string;
    marginSuffix: string;
  };

  spacerBlock: {
    heightLabel: string;
  };

  sectionBlock: {
    titleLabel: string;
    titlePlaceholder: string;
    collapsible: string;
    startCollapsed: string;
    empty: string;
  };

  progressBlock: {
    variableLabel: string;
    heightLabel: string;
    preview: string;
  };

  saveBlock: {
    hint: string;
    titleLabel: string;
    titlePlaceholder: string;
    notifyLabel: string;
    notifyTextLabel: string;
    notifyTextPlaceholder: string;
  };

  calloutBlock: {
    variantLabel: string;
    variants: { info: string; success: string; warning: string; danger: string; note: string };
    iconLabel: string;
    iconPlaceholder: string;
    titleLabel: string;
    titlePlaceholder: string;
    contentLabel: string;
    contentPlaceholder: string;
  };

  selectBlock: {
    labelField: string;
    labelPlaceholder: string;
    variableLabel: string;
    selectVariable: string;
    optionsTitle: string;
    addOption: string;
    noOptions: string;
    optionLabelPlaceholder: string;
    optionValuePlaceholder: string;
    deleteOption: string;
  };

  sliderBlock: {
    labelField: string;
    labelPlaceholder: string;
    variableLabel: string;
    selectVariable: string;
    min: string;
    max: string;
    step: string;
    showValue: string;
  };

  displayObjectBlock: {
    sourceLabel: string;
    sourceGroup: string;
    sourceManual: string;
    groupLabel: string;
    selectGroup: string;
    loadFields: string;
    loadFieldsHint: string;
    autoSync: string;
    autoSyncHint: string;
    autoSyncNotice: string;
    dragField: string;
    layoutLabel: string;
    layouts: { list: string; inline: string; table: string; cards: string; grid: string; bars: string };
    columns: string;
    live: string;
    fieldsTitle: string;
    addField: string;
    noFields: string;
    selectField: string;
    fieldLabelPlaceholder: string;
    renders: { text: string; bar: string; bool: string; badge: string };
    deleteField: string;
    barMax: string;
    barMaxOr: string;
    barMaxVar: string;
  };

  blockEffects: {
    delayLabel: string;
    delaySeconds: string;
    delaySuffix: string;
    animationLabel: string;
    animDuration: string;
    animDurationSuffix: string;
    animFadeLabel: string;
    animOffsetX: string;
    animOffsetY: string;
    animOffsetSuffix: string;
    animOffsetHint: string;
    typewriterLabel: string;
    typewriterSpeed: string;
    typewriterSpeedSuffix: string;
  };

  variableSetBlock: {
    opAssign: string;
    opAdd: string;
    opSubtract: string;
    opMultiply: string;
    opDivide: string;
    opPush: string;
    opRemove: string;
    opClear: string;
    modeManual: string;
    modeRandom: string;
    modeExpression: string;
    modeDynamic: string;
    variableLabel: string;
    noVariables: string;
    selectVariable: string;
    operationLabel: string;
    valueLabel: string;
    textPlaceholder: string;
    expressionLabel: string;
    insertVarTitle: (name: string) => string;
    controlVariable: string;
    selectControlVariable: string;
    mappingsLabel: string;
    addMapping: string;
    noMappings: string;
    matchMode: string;
    matchExact: string;
    matchRange: string;
    exactValueLabel: string;
    fromLabel: string;
    toLabel: string;
    resultLabel: string;
    defaultLabel: string;
    randomRange: string;
    randomLength: string;
    randomLengthSuffix: string;
  };

  timeManipulationBlock: {
    title: string;
    variableLabel: string;
    years: string;
    months: string;
    days: string;
    hours: string;
    minutes: string;
  };

  // ─── Shared image mapping editor ────────────────────────────────────────────
  imageMappingEditor: {
    mappingsLabel: string;
    addOne: string;
    generateBtn: string;
    noMappings: string;
    emptySlots: (count: number) => string;
    matchExact: string;
    matchRange: string;
    valueLabel: string;
    fromLabel: string;
    toLabel: string;
    fileLabel: string;
    defaultLabel: string;
    selectAsset: string;
    genByRange: string;
    genMin: string;
    genMax: string;
    genCount: string;
    genStepPreview: (step: number, count: number) => string;
    genReplace: string;
    genAppend: string;
    genByValues: string;
    genValuesPlaceholder: string;
    genValuesPreview: (count: number) => string;
  };

  // ─── Array accessor UI ──────────────────────────────────────────────────────
  arrayAccessor: {
    label: string;
    whole: string;
    index: string;
    length: string;
    indexLiteral: string;
    indexVariable: string;
    indexPlaceholder: string;
    selectIndexVar: string;
  };

  // ─── Checkbox block ──────────────────────────────────────────────────────────
  checkboxBlock: {
    labelField: string;
    labelPlaceholder: string;
    modeFlags: string;
    modeArray: string;
    variableLabel: string;
    selectVariable: string;
    noOptions: string;
    addOption: string;
    deleteOption: string;
    optionLabelPlaceholder: string;
    optionValuePlaceholder: string;
    optionVarPlaceholder: string;
  };

  // ─── Radio block ─────────────────────────────────────────────────────────────
  radioBlock: {
    labelField: string;
    labelPlaceholder: string;
    variableLabel: string;
    selectVariable: string;
    noOptions: string;
    addOption: string;
    deleteOption: string;
    optionLabelPlaceholder: string;
    optionValuePlaceholder: string;
  };

  // ─── Function block ───────────────────────────────────────────────────────────
  functionBlock: {
    labelField: string;
    labelPlaceholder: string;
    functionTitle: string;
    sceneLabel: string;
    noFuncScenes: string;
    actionsTitle: string;
    addAction: string;
    noActions: string;
    deleteAction: string;
    selectVariable: string;
    textPlaceholder: string;
  };

  // ─── Popup block ─────────────────────────────────────────────────────────────
  popupBlock: {
    sceneLabel:        string;
    noPopupScenes:     string;
    titleLabel:        string;
    titlePlaceholder:  string;
  };

  // ─── Shared: action type selector (ButtonBlock, LinkBlock, FunctionBlock, CellButton) ──
  actionType: {
    setVariable: string;
    openPopup:   string;
    popupScene:  string;
    popupTitle:  string;
    popupTitlePlaceholder: string;
    noPopupScenes: string;
    createInventoryPopup: string;
    createInventoryPopupTitle: string;
  };

  // ─── Inventory block ──────────────────────────────────────────────────────────
  inventoryBlock: {
    charLabel:       string;
    charNone:        string;
    titleLabel:      string;
    titlePlaceholder: string;
    noHeroHint:      string;
    // Runtime dialog strings (injected into exported HTML)
    runtimeAll:            string;
    runtimeCategoryWear:   string;
    runtimeCategoryConsume:string;
    runtimeCategoryMisc:   string;
    runtimeEquip:          string;
    runtimeUnequip:        string;
    runtimeUse:            string;
    runtimeDrop:           string;
    runtimeEmpty:          string;
    runtimeDropConfirmTitle: string;
    runtimeDropConfirmMsg:   string;  // supports {name} {qty} placeholders
    runtimeDropConfirmYes:   string;
    runtimeDropConfirmNo:    string;
    runtimeSlotMissingTitle: string;
    runtimeSlotMissingMsg:   string;  // supports {slot} placeholder
    runtimeQty:            string;   // "Qty: {n}"
    runtimeEquipped:       string;
  };

  // ─── Editor preferences modal ────────────────────────────────────────────────
  editorPrefs: {
    title: string;
    subtitle: string;
    close: string;
    footerHint: string;
    tabAppearance: string;
    tabShortcuts: string;
    tabWorkspace: string;
    tabBehavior: string;
    tabAi: string;

    sectionTheme: string;
    themeDark: string;
    themeMidnight: string;
    themeWarm: string;
    soon: string;

    sectionTexture: string;
    textureOn: string;
    textureOff: string;
    textureHint: string;
    sectionDensity: string;
    densityCompact: string;
    densityComfortable: string;

    sectionLanguage: string;

    shortcutsHint: string;
    shortcutsGeneral: string;
    saveProject: string;
    undo: string;
    redo: string;
    openPreferences: string;
    projectSettings: string;
    shortcutsEditor: string;
    find: string;
    replace: string;
    shortcutsNavigation: string;
    nextScene: string;
    previousScene: string;
    closeModalCancel: string;

    sectionAutosave: string;
    autosaveLabel: string;
    autosaveIntervalLabel: string;
    intervalMinutes: (n: number) => string;
    sectionAppearance: string; // Duplicate, remove later
    compactModeLabel: string; // Duplicate, remove later
    sectionConfirms: string;
    confirmDeleteScene: string;
    confirmDeleteGroup: string;
    confirmDeleteVariable: string;
    confirmDeleteWatcher: string;
    confirmDeleteBlock: string;
    confirmDeleteCharacter: string;
    sectionGroupDelete: string;
    deleteGroupBehaviorLabel: string;
    deleteGroupUngroup: string;
    deleteGroupWithScenes: string;
    sectionExport: string;
    confirmOpenFolderAfterExport: string;
    sectionProjects: string;
    projectsDirLabel: string;
    projectsDirHint: string;
    projectsDirBrowse: string;
    projectsDirReset: string;
    sectionValidator: string;
    validationModeLabel: string;
    validationModeLive: string;
    validationModeManual: string;
    validationModeHint: string;
    sectionCompile: string;
    compileModeLabel: string;
    compileModeLive: string;
    compileModeManual: string;
    compileModeHint: string;
    sectionStats: string;
    statsModeLabel: string;
    statsModeLive: string;
    statsModeManual: string;
    statsModeHint: string;
    sectionGraph: string;
    graphModeLabel: string;
    graphModeLive: string;
    graphModeManual: string;
    graphModeHint: string;
    titleBarStyleLabel: string;
    titleBarStyleCustom: string;
    titleBarStyleNative: string;
    titleBarStyleRestartNote: string;
    saveOnExitLabel: string;
    sectionWindowLayout: string; // Duplicate, remove later
    workspacePresets: string; // Duplicate, remove later
    saveCurrentLayout: string;
    presetNamePlaceholder: string;
    applyPreset: string;
    deletePreset: string;
    activePresetLabel: string;
    customLayout: string;
    overwritePreset: string;
    noPresetsSaved: string;
    presetSaved: string;
    builtInPresets: string;
    userPresets: string;

    sectionLLM: string; // Duplicate, remove later
    llmEnabled: string;
  };

  // ─── LLM Settings modal ─────────────────────────────────────────────────────
  llmSettingsModal: {
    title: string; // Duplicate, remove later
    urlLabel: string;
    maxTokensLabel: string;
    temperatureLabel: string;
    systemPromptLabel: string;
    systemPromptPlaceholder: string;
    imageGenSectionLabel: string;
    imageGenProviderLabel: string;
    comfyUiUrlLabel: string;
    comfyUiUrlPlaceholder: string;
    comfyUiWorkflowsDirLabel: string;
    comfyUiWorkflowsDirPlaceholder: string;
    comfyUiWorkflowsDirHint: string;
    comfyUiWorkflowsDirBrowse: string;
    pollinationsModelLabel: string;
    pollinationsModelPlaceholder: string;
    pollinationsTokenLabel: string;
    pollinationsTokenPlaceholder: string;
    // Merged from standalone AI Settings modal into Project Settings > LLM tab
    sectionLlm: string;
    sectionParams: string;
    providerLabel: string;
    geminiApiKeyLabel: string;
    geminiApiKeyPlaceholder: string;
    geminiModelLabel: string;
    refreshModels: string;
    refreshingModels: string;
    customModelPlaceholder: string;
    openaiUrlLabel: string;
    openaiUrlHint: string;
    openaiUrlPlaceholder: string;
    openaiApiKeyLabel: string;
    openaiModelLabel: string;
    filterThoughtLabel: string;
    filterThoughtHint: string;
    presetsLabel: string;
    generationHistoryLabel: string;
    generationHistoryMemory: string;
    generationHistoryProject: string;
    generationHistoryDisabled: string;
    autoSaveHint: string;

    // New keys for LLM tab
    llmEnabledHint: string;
    koboldcpp: string;
    gemini: string;
    openai: string;
    koboldcppPlaceholder: string;
    openaiApiKeyPlaceholder: string;
    openaiModelPlaceholder: string;
    apiKeyRequired: string;
    modelsFetched: (count: number) => string;
    fetchModelsFailed: string;
    customModelName: string;
    chars: string;

    presetStoryteller: string;
    presetLiteraryNovelist: string;
    presetVisualNovelWriter: string;
    presetHorrorSuspense: string;
    presetFantasyAdventure: string;
    presetDialogueFocused: string;
    presetRomance: string;
    presetSciFi: string;

    tierFree: string;
    tierFreeLimited: string;
    tierPaid: string;
    tierExperimental: string;

    comfyUi: string;
    pollinationsAi: string;
  };

  // ─── LLM Generate Button ─────────────────────────────────────────────────────
  llmGenerateButton: {
    continueGeneration: string;
    rephraseImprove: string;
    generateFromHint: string;
    translateTo: (lang: string) => string;
    prevGeneration: string;
    nextGeneration: string;
    stopGeneration: string;
    aiTools: string;
    generationStopped: string;
    generateFailed: (provider: string) => string;
  };

  // ─── Project settings modal ──────────────────────────────────────────────────
  projectSettings: {
    createTitle:            string;
    editTitle:              string;
    fieldTitle:             string;
    fieldTitlePlaceholder:  string;
    fieldAuthor:            string;
    fieldAuthorPlaceholder: string;
    fieldDescription:       string;
    fieldDescPlaceholder:   string;
    fieldStoryLanguage:            string;
    fieldStoryLanguageNote:        string;
    fieldStoryLanguagePlaceholder: string;
    sectionAppearance:      string;
    fieldBgColor:           string;
    /** Hint that links to the sidebar scene's System tab for background/typography. */
    sidebarStyleHint:       string;
    /** Hint that links to the title scene's System tab for title color/font settings. */
    titleStyleHint:         string;
    sectionAdvanced:        string;
    fieldAudioUnlockText:      string;
    fieldAudioUnlockTextPlaceholder: string;
    fieldAudioUnlockTextNote:  string;
    fieldAutoloadSave:         string;
    fieldAutoloadSaveNote:     string;
    sectionLifecycleHooks:     string;
    lifecycleHooksNote:        string;
    fieldCustomInit:                  string;
    fieldCustomInitPlaceholder:       string;
    fieldCustomInitNote:              string;
    fieldPassageReadyScript:          string;
    fieldPassageReadyScriptPlaceholder: string;
    fieldPassageReadyScriptNote:      string;
    fieldPassageDoneScript:           string;
    fieldPassageDoneScriptPlaceholder:  string;
    fieldPassageDoneScriptNote:       string;
    create:                 string;
    save:                   string;
    chooseFolder:           string;
    titleEmpty:             string;
    successSave:            string;
    successCreate:          string;
    // AI features (description + lore expansion only; AI image gen was tied to the
    // legacy sidebar header image and was removed with Phase 9 cleanup).
    aiLlmSettingsBtn:       string;
    aiExpandDesc:           string;
    aiExpandDescBusy:       string;
    aiGenerateLore:         string;
    aiGenerateLoreBusy:     string;
    aiLlmDisabledHint:      string;
    aiExpandError:          string;
    aiLoreError:            string;
    // Tabbed layout
    tabGeneral:             string;
    tabAppearance:          string;
    tabBlockDefaults:       string;
    tabAdvanced:            string;
    sectionBlockDefaults:        string;  // legacy single section title
    blockDefaultsDescription:    string;
    // Per-type section titles + descriptions for Phase 2 Block defaults tab
    sectionBlockDefaultsButton:     string;
    sectionBlockDefaultsLink:       string;
    sectionBlockDefaultsFunction:   string;
    sectionBlockDefaultsChoice:     string;
    sectionBlockDefaultsPopup:      string;
    sectionBlockDefaultsText:       string;
    sectionBlockDefaultsImage:      string;
    sectionBlockDefaultsImageGen:   string;
    sectionBlockDefaultsVideo:      string;
    sectionBlockDefaultsInclude:    string;
    sectionBlockDefaultsDivider:    string;
    sectionBlockDefaultsCheckbox:   string;
    sectionBlockDefaultsRadio:      string;
    sectionBlockDefaultsInputField: string;
    sectionBlockDefaultsTabs:       string;
    blockDefaultsButtonDesc:        string;
    blockDefaultsLinkDesc:          string;
    blockDefaultsFunctionDesc:      string;
    blockDefaultsChoiceDesc:        string;
    blockDefaultsPopupDesc:         string;
    blockDefaultsTextDesc:          string;
    blockDefaultsImageDesc:         string;
    blockDefaultsImageGenDesc:      string;
    blockDefaultsVideoDesc:         string;
    blockDefaultsIncludeDesc:       string;
    blockDefaultsDividerDesc:       string;
    blockDefaultsCheckboxDesc:      string;
    blockDefaultsRadioDesc:         string;
    blockDefaultsInputFieldDesc:    string;
    blockDefaultsTabsDesc:          string;
    sectionColors:          string;
    fieldLore:              string;
    fieldLorePlaceholder:   string;
    fieldLoreNote:          string;
  };

  // ─── Scene settings modal ────────────────────────────────────────────────────
  sceneSettings: {
    title: string;
    tagsLabel: string;
    addTagPlaceholder: string;
    done: string;
  };

  // ─── Watchers ────────────────────────────────────────────────────────────────
  watchers: {
    add: string;
    empty: string;
    confirmDelete: (label: string) => string;
    defaultLabel: string;
    labelPlaceholder: string;
    enabledLabel: string;
    conditionSection: string;
    actionsSection: string;
    navigateSection: string;
    navigateNone: string;
    navigateBack: string;
    navigateScene: string;
    noVariable: string;
    addAction: string;
    unconditionalLabel: string;
    unconditionalHint: string;
  };

  // ─── Items ───────────────────────────────────────────────────────────────────
  items: {
    add: string;
    empty: string;
    confirmDelete: (name: string) => string;
    noName: string;
    defaultName: string;
    createTitle: string;
    editTitle: string;
    save: string;
    fieldName: string;
    fieldVarName: string;
    varNameHint: string;
    varNameInvalid: string;
    varNameTaken: string;
    varNameEmpty: string;
    nameTaken: string;
    nameEmpty: string;
    fieldCategory: string;
    categoryWearable: string;
    categoryConsumable: string;
    categoryMisc: string;
    fieldStackable: string;
    fieldTargetSlot: string;
    targetSlotHint: string;
    fieldIcon: string;
    iconStatic: string;
    iconGenerated: string;
    iconBound: string;
    iconBoundSelectVar: string;
    consumableFuncHint: string;
    customVarsSection: string;
    customVarsAdd: string;
    customVarsEmpty: string;
    customVarsNamePlaceholder: string;
    customVarsConfirmDelete: (name: string) => string;
    // tabbed modal
    tabBasics: string;
    tabIcon: string;
    tabUsage: string;
    tabProps: string;
    sectionIdentity: string;
    sectionCategory: string;
    sectionSlot: string;
    previewLabel: string;
    modalSubtitle: string;
    fieldDescription: string;
    descriptionPlaceholder: string;
    categoryWearableSubtitle: string;
    categoryConsumableSubtitle: string;
    categoryMiscSubtitle: string;
    usageSection: string;
    usageSectionDesc: string;
    usageNotApplicable: string;
    usageFuncCreatedOnSave: string;
    usageFuncOpenBtn: string;
    stackableLabel: string;
    stackableHint: string;
  };

  // ─── Containers ─────────────────────────────────────────────────────────────
  containers: {
    add: string;
    empty: string;
    confirmDelete: (name: string) => string;
    noName: string;
    defaultName: string;
    createTitle: string;
    editTitle: string;
    save: string;
    fieldName: string;
    fieldVarName: string;
    varNameHint: string;
    varNameEmpty: string;
    varNameInvalid: string;
    varNameTaken: string;
    nameTaken: string;
    nameEmpty: string;
    fieldMode: string;
    modeShop: string;
    modeChest: string;
    modeLoot: string;
    stockSection: string;
    stockAdd: string;
    stockEmpty: string;
    stockItem: string;
    stockQty: string;
    stockPrice: string;
    stockInfinite: string;
    noItemsDefined: string;
    // ContainerBlock
    blockNoContainer: string;
    blockNoChar: string;
    blockContainerLabel: string;
    blockCharLabel: string;
    blockTitleLabel: string;
    // tabbed modal
    tabBasics: string;
    tabAppearance: string;
    tabStock: string;
    sectionIdentity: string;
    sectionMode: string;
    sectionBgImage: string;
    previewLabel: string;
    modalSubtitle: string;
    modeShopSubtitle: string;
    modeChestSubtitle: string;
    modeLootSubtitle: string;
    bgImageStatic: string;
    bgImageGenerate: string;
    bgImageHint: string;
    bgImageNone: string;
  };

  insertToolbar: {
    varTitle: string;
    codeTitle: string;
    tooltipTitle: string;
    exprTitle: string;
    condTitle: string;
    linkTitle: string;
    tooltipText: string;
    tooltipContent: string;
    tooltipImage: string;
    tooltipNoImage: string;
    exprLabel: string;
    exprPlaceholder: string;
    condVariable: string;
    condValue: string;
    condIfTrue: string;
    condElse: string;
    condElseOptional: string;
    linkLabel: string;
    linkTarget: string;
    linkTargetPlaceholder: string;
    insert: string;
  };
}
