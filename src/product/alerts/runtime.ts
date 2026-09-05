import type {
  AlertRulesRepository,
  UpdateCenterRepository,
  UpdateDeepLinkDescriptor,
} from '../../modules/alerts';

export interface UpdateCenterModuleRuntime {
  readonly repository: UpdateCenterRepository;
  readonly onOpenDeepLink?: (descriptor: UpdateDeepLinkDescriptor) => void;
}

export interface AlertRulesModuleRuntime {
  readonly repository: AlertRulesRepository;
}

/** Host capabilities required by the two rebuilt Alerts destinations. */
export interface AlertsModuleRuntime {
  readonly updateCenter: UpdateCenterModuleRuntime;
  readonly alertRules: AlertRulesModuleRuntime;
}
