/**
 * Central registry of `testID` values used by Maestro E2E flows.
 *
 * Keeping these in one place helps avoid accidental selector changes.
 */
export const E2E_TEST_IDS = {
  login: {
    screen: 'login.screen',
    googleButton: 'login.googleButton',
    e2eButton: 'login.e2eButton',
  },

  tabs: {
    navigator: 'tabs.navigator',
    home: 'tab.home',
    trends: 'tab.trends',
    oracle: 'tab.oracle',
    aiAnalyst: 'tab.aiAnalyst',
    settings: 'tab.settings',
    food: 'tab.food',
    sport: 'tab.sport',
    notifications: 'tab.notifications',
    loopTuner: 'tab.loopTuner',
  },

  screens: {
    home: 'screen.home',
    trends: 'screen.trends',
    oracle: 'screen.oracle',
    aiAnalyst: 'screen.aiAnalyst',
    settings: 'screen.settings',
    food: 'screen.food',
    sport: 'screen.sport',
    notifications: 'screen.notifications',
    loopTuner: 'screen.loopTuner',

    sportAdd: 'screen.sport.add',
    notificationsAdd: 'screen.notifications.add',
  },

  settings: {
    toggleFoodTab: 'settings.toggle.foodTab',
    toggleSportTab: 'settings.toggle.sportTab',
    toggleNotificationsTab: 'settings.toggle.notificationsTab',
    toggleAiAnalystTab: 'settings.toggle.aiAnalystTab',
    toggleLoopTunerTab: 'settings.toggle.loopTunerTab',

    aiApiKeyInput: 'settings.input.ai.apiKey',
    aiEnabledToggle: 'settings.toggle.ai.enabled',

    aiSaveKeyButton: 'settings.button.ai.saveKey',
    aiCheckKeyButton: 'settings.button.ai.checkKey',

    aiModelPreset: 'settings.select.ai.model.preset',
    aiModelCustomInput: 'settings.input.ai.model.custom',

    severeHypoInput: 'settings.input.severeHypo',
    hypoInput: 'settings.input.hypo',
    hyperInput: 'settings.input.hyper',
    severeHyperInput: 'settings.input.severeHyper',
    nightStartHourInput: 'settings.input.nightStartHour',
    nightEndHourInput: 'settings.input.nightEndHour',
  },

  aiAnalyst: {
    missionHypoDetective: 'aiAnalyst.mission.hypoDetective',
    chatInput: 'aiAnalyst.chat.input',
    sendButton: 'aiAnalyst.chat.send',
    backButton: 'aiAnalyst.back',
  },

  notifications: {
    addButton: 'notifications.addButton',
    addTitle: 'screen.notifications.add.title',
    addSubmit: 'screen.notifications.add.submit',
  },

  sport: {
    addButton: 'sport.addButton',
    nameInput: 'sport.nameInput',
    intensitySlider: 'sport.intensitySlider',
    submitButton: 'sport.submitButton',
  },

  /**
   * Chart container selectors.
   *
   * Prefer putting `testID`s on the *screen-level chart containers* (not individual SVG nodes),
   * so E2E tests stay stable even if the chart internals change.
   */
  charts: {
    cgmSection: 'chart.cgmSection',
    cgmGraph: 'chart.cgmGraph',
    cgmGraphFullScreenButton: 'chart.cgmGraph.fullscreenButton',
    cgmGraphFullScreen: 'chart.cgmGraph.fullscreen',
    agpSummary: 'chart.agpSummary',
    agpSummaryFullScreenButton: 'chart.agpSummary.fullscreenButton',
    agpGraphFullScreen: 'chart.agpGraph.fullscreen',

    oracleGhostGraph: 'chart.oracle.ghostGraph',
  },

  /**
   * Glucose log (Home screen list) selectors.
   */
  glucoseLog: {
    list: 'glucoseLog.list',
    fullScreenButton: 'glucoseLog.fullscreenButton',
  },

  fullscreen: {
    screen: 'screen.fullscreen',
    title: 'screen.fullscreen.title',
    backButton: 'screen.fullscreen.backButton',
    rotateButton: 'screen.fullscreen.rotateButton',
  },

  /**
   * IOB/COB visualization selectors (inside glucose log rows).
   *
   * Note: there can be multiple instances on screen; Maestro uses these as
   * existence checks (any visible match is acceptable).
   */
  loadBars: {
    container: 'loadBars.container',
    iobText: 'loadBars.iobText',
    cobText: 'loadBars.cobText',
  },

  /**
   * Smart expandable header (Home) selectors.
   */
  homeHeader: {
    toggle: 'homeHeader.toggle',
    predictionsRow: 'homeHeader.predictionsRow',
    predictionLabel: 'homeHeader.predictionLabel',
    predictionValue0: 'homeHeader.predictionValue0',
    predictionValue1: 'homeHeader.predictionValue1',
    predictionValue2: 'homeHeader.predictionValue2',


    // Test-only markers to validate whether the header is driven by live Nightscout
    // polling vs the deterministic E2E fallback snapshot.
    sourceNightscout: 'homeHeader.source.nightscout',
    sourceFallback: 'homeHeader.source.fallback',
  },

  /**
   * Oracle / Events tab selectors.
   */
  oracle: {
    headerSummary: 'oracle.header.summary',
    loadSummary: 'oracle.header.loadSummary',
    loadToggle: 'oracle.header.loadToggle',
    slopeMinus: 'oracle.header.slope.minus',
    slopePlus: 'oracle.header.slope.plus',
    cacheDaysMinus: 'oracle.header.cacheDays.minus',
    cacheDaysPlus: 'oracle.header.cacheDays.plus',
    historySyncHint: 'oracle.history.syncHint',
    statusBanner: 'oracle.status.banner',
    retryButton: 'oracle.retry.button',
    executeButton: 'oracle.execute.button',
    errorText: 'oracle.error.text',
    eventsList: 'oracle.events.list',
    eventRow: 'oracle.events.row',
    strategiesList: 'oracle.strategies.list',
    strategyCard: 'oracle.strategies.card',
    disclaimer: 'oracle.disclaimer',
    previousList: 'oracle.previous.list',
    previousRow: 'oracle.previous.row',
    previousDetails: 'oracle.previous.details',
    noMatches: 'oracle.previous.noMatches',
  },

  trends: {
    quickStatsSection: 'trends.quickStats.section',
    quickStatsAverageTitle: 'trends.quickStats.average.title',
    quickStatsAvgTdd: 'trends.quickStats.avgTdd',
    metricSelectorCollapsable: 'trends.metricSelector.collapsable',

    dateRangeFromButton: 'trends.dateRange.from',
    dateRangeToButton: 'trends.dateRange.to',
    dateRangePreset7: 'trends.dateRange.preset.7',
    dateRangePreset14: 'trends.dateRange.preset.14',
    dateRangePreset30: 'trends.dateRange.preset.30',

    quickStatsSevereHyposCard: 'trends.quickStats.severeHypos',
    quickStatsLongestHypoCard: 'trends.quickStats.longestHypo',
  },

  hypoInvestigation: {
    screen: 'screen.hypoInvestigation',
  },

  /**
   * Loop Settings Impact Analysis (LoopTuner) selectors.
   */
  loopTuner: {
    container: 'loopTuner.container',
    profileCard: 'loopTuner.profileCard',
    impactSummary: 'loopTuner.impactSummary',
    ghostChart: 'loopTuner.ghostChart',
    windowPills: 'loopTuner.windowPills',
    metricRow: 'loopTuner.metricRow',
    backButton: 'loopTuner.backButton',
  },
} as const;

