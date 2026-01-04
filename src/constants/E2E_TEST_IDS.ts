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
    food: 'tab.food',
    sport: 'tab.sport',
    notifications: 'tab.notifications',
  },

  screens: {
    home: 'screen.home',
    trends: 'screen.trends',
    food: 'screen.food',
    sport: 'screen.sport',
    notifications: 'screen.notifications',

    sportAdd: 'screen.sport.add',
    notificationsAdd: 'screen.notifications.add',
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
} as const;
