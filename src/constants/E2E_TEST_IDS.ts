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
} as const;
