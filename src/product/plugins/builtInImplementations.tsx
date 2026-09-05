import React from 'react';
import type {RuntimePluginImplementation} from '../../modules/plugins';
import type {ProductImplementationRegistration} from '../app';
import {CORE_DESTINATION_IDS} from '../destinations';
import {AgpGuidePluginView} from './AgpGuidePluginView';

export const BUILT_IN_PLUGIN_IMPLEMENTATION_IDS = {
  agpGuide: 'shani.first-party.agp-guide',
} as const;

export const BUILT_IN_PLUGIN_EXTENSION_POINTS = {
  trendsLearning: 'core.trends.learning-extensions',
} as const;

export const BUILT_IN_RUNTIME_PLUGIN_IMPLEMENTATIONS = [
  {
    extensionId: 'plugin.agp-guide',
    publisherId: 'shani.first-party',
    implementationId: BUILT_IN_PLUGIN_IMPLEMENTATION_IDS.agpGuide,
    implementationKey: 'PluginAgpGuide',
    extensionPointId: BUILT_IN_PLUGIN_EXTENSION_POINTS.trendsLearning,
    ownerModuleId: CORE_DESTINATION_IDS.trends,
    platforms: ['ios', 'android', 'web'],
    allowedCapabilities: [],
    allowedHealthRisks: ['informational'],
    allowStartDestination: false,
    healthCheck: async () => ({ok: true as const}),
  },
] as const satisfies readonly RuntimePluginImplementation[];

export const BUILT_IN_RUNTIME_PLUGIN_REGISTRATIONS = [
  {
    implementationKey: 'PluginAgpGuide',
    render: host => <AgpGuidePluginView locale={host.locale} />,
  },
] as const satisfies readonly ProductImplementationRegistration[];
