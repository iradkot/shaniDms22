import type {
  AlertDeliveryMode,
  AlertRuleInput,
  AlertRulesRepository,
  UpdateCenterRepository,
  UpdateDeepLinkDescriptor,
} from '../../modules/alerts';
import type {DestinationLocale} from '../destinations';

export interface UpdateCenterModuleRuntime {
  readonly repository: UpdateCenterRepository;
  readonly onOpenDeepLink?: (descriptor: UpdateDeepLinkDescriptor) => void;
}

export interface AlertRulesModuleRuntime {
  readonly repository: AlertRulesRepository;
  /** Optional host-provided AI capability. Interpreting a draft never saves it. */
  readonly interpreter?: AlertRuleDraftInterpreter;
  /** Device-local delivery preference. Phone settings can still override it. */
  readonly deliveryMode?: AlertDeliveryMode;
  readonly deliveryModeReady?: boolean;
  readonly deliveryModeLoadError?: boolean;
  readonly retryDeliveryMode?: () => void;
  readonly setDeliveryMode?: (mode: AlertDeliveryMode) => Promise<void>;
}

export interface AlertRuleDraftInterpreter {
  readonly availability: 'ready' | 'disabled' | 'missing-credentials';
  readonly interpret: (
    text: string,
    locale: DestinationLocale,
  ) => Promise<AlertRuleInput>;
  readonly onOpenSettings?: () => void;
}

/** Host capabilities required by the two rebuilt Alerts destinations. */
export interface AlertsModuleRuntime {
  readonly updateCenter: UpdateCenterModuleRuntime;
  readonly alertRules: AlertRulesModuleRuntime;
}
