export type UsageWindowKind = "5h" | "7d";
export type UsageUnit = "messages" | "credits" | "tokens" | "unknown";
export type UsageRawSource = "official-api" | "codex-status" | "unsupported";

export interface UsageWindow {
  window: UsageWindowKind;
  used?: number;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  percentage?: number;
  unit: UsageUnit;
}

export interface CodexUsageInfo {
  accountName: string;
  fetchedAt: string;
  plan?: string;
  windows: UsageWindow[];
  rawSource: UsageRawSource;
  warning?: string;
  subscription?: SubscriptionInfo;
}

export interface TokenUsageBreakdown {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface TokenUsageDay {
  date: string;
  usage: TokenUsageBreakdown;
  turns: number;
}

export interface TokenUsageSummary {
  fetchedAt: string;
  codexHome: string;
  sessionsScanned: number;
  tokenEvents: number;
  total: TokenUsageBreakdown;
  today: TokenUsageBreakdown;
  maxSessionTotal: TokenUsageBreakdown;
  days: TokenUsageDay[];
  warning?: string;
}

export interface NewAccountLoginPreparation {
  didLogout: boolean;
  previousAccount?: string;
  authPath: string;
}

export interface DailyUsageEntry {
  date: string;
  total: number;
  samples: number;
  maxFiveHourPercentage: number;
  maxSevenDayPercentage: number;
  accounts: Record<string, number>;
}

// ── Subscription types ──

export type SubscriptionPlan =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "pro_lite"
  | "team"
  | "business"
  | "enterprise"
  | "edu"
  | "api_key"
  | "unknown";

export type SubscriptionSource =
  | "auth-mode"
  | "id-token"
  | "agent-identity"
  | "usage-api"
  | "manual"
  | "unknown";

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  displayName: string;
  rawPlan?: string;
  source: SubscriptionSource;
  confidence: "high" | "medium" | "low";
  isWorkspaceAccount?: boolean;
  warning?: string;
}

// ── Account & Auth ──

export interface AccountMeta {
  name: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  source?: string;
  sha256Prefix?: string;
  size?: number;
  isActive?: boolean;
  lastUsageCheckAt?: string;
  usage?: CodexUsageInfo;
  subscription?: SubscriptionInfo;
  manualSubscriptionOverride?: SubscriptionPlan;
  priority?: boolean;
  health: "healthy" | "expiring_soon" | "expired" | "invalid";
  healthMessage?: string;
  authTokens: AuthTokenInfo[];
}

export interface ImportAccountsResult {
  imported: AccountMeta[];
  overwritten: string[];
  skipped: string[];
}

export interface AuthTokenInfo {
  kind: string;
  present: boolean;
  expiresAt?: string;
  status: "missing" | "no_expiry_claim" | "valid" | "expiring_soon" | "expired" | string;
}

// ── Local proxy, providers & mobile residency ──

export type ProviderKind =
  | "chat_gpt_oauth"
  | "open_ai_api_key"
  | "open_ai_compatible"
  | "glm"
  | "mimo"
  | "deep_seek"
  | "custom_chat_completions";

export type ProviderHealthStatus = "healthy" | "cooling_down" | "disabled" | "invalid" | "unknown";

export interface ProviderHealth {
  status: ProviderHealthStatus;
  lastError?: string;
  lastUsedAt?: string;
  cooldownUntil?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl: string;
  accountName?: string;
  apiKey?: string;
  modelMap?: Record<string, string>;
  includeInFailover: boolean;
  health: ProviderHealth;
}

export interface PublicProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl: string;
  accountName?: string;
  hasSecret: boolean;
  modelMap?: Record<string, string>;
  includeInFailover: boolean;
  health: ProviderHealth;
}

export interface RoutingPolicy {
  requestProviderId?: string;
  automaticFailover: boolean;
  maxRetries: number;
  allowThirdPartyFailover: boolean;
  cooldownSeconds: number;
}

export interface MobileResidencyConfig {
  enabled: boolean;
  accountName?: string;
  restoreOnStartup: boolean;
  notifyOnError: boolean;
}

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  upstreamBaseUrl: string;
  installCodexConfig: boolean;
  routing: RoutingPolicy;
  mobileResidency: MobileResidencyConfig;
}

export interface FailoverEvent {
  id: string;
  time: string;
  fromProvider: string;
  toProvider?: string;
  reason: string;
  statusCode?: number;
}

export interface MobileResidencyState {
  enabled: boolean;
  accountName?: string;
  diskAccount?: string;
  requestProvider?: string;
  healthy: boolean;
  warnings: string[];
}

export interface CodexProxyConfigStatus {
  configExists: boolean;
  backupExists: boolean;
  installed: boolean;
  expectedBaseUrl: string;
  currentBaseUrl?: string;
  error?: string;
}

export interface ProxyState {
  status: "running" | "stopped" | "error";
  listenUrl?: string;
  config: ProxyConfig;
  codexConfig: CodexProxyConfigStatus;
  requestProvider?: PublicProviderConfig;
  providers: PublicProviderConfig[];
  mobileResidency: MobileResidencyState;
  recentFailovers: FailoverEvent[];
  warnings: string[];
}

export interface SwitchHistoryEntry {
  id: string;
  switchedAt: string;
  fromAccount?: string;
  toAccount: string;
  success: boolean;
  error?: string;
}

export interface SwitchRecommendation {
  account: AccountMeta;
  score: number;
  reason: string;
}

// ── Smart quota scheduler ──

export type SchedulerMode = "recommended" | "manual";
export type SchedulerAccountScope = "current" | "all_enabled";
export type SchedulerMaturityLevel = "insufficient" | "temporary" | "usable" | "stable" | "reliable";
export type SchedulerResultStatus =
  | "success"
  | "skipped_already_triggered"
  | "skipped_missed_window"
  | "skipped_account_unhealthy"
  | "skipped_insufficient_data"
  | "failed_network"
  | "failed_auth"
  | "failed_unknown"
  | "possibly_effective"
  | "not_effective";

export interface SchedulerAccountConfig {
  enabled: boolean;
  mode: SchedulerMode;
  manualAnchorTime?: string;
  maxTriggersPerDay: number;
  lastTriggeredDate?: string;
  autoPaused: boolean;
  consecutiveFailures: number;
  consecutiveNotEffective: number;
}

export interface SchedulerConfig {
  enabled: boolean;
  passiveAnalysisEnabled: boolean;
  invitePopupEnabled: boolean;
  dismissedInviteUntil?: string;
  neverShowInvite: boolean;
  mode: SchedulerMode;
  manualAnchorTime?: string;
  accountScope: SchedulerAccountScope;
  perAccount: Record<string, SchedulerAccountConfig>;
}

export interface SchedulerHeatmapBucket {
  day: string;
  minuteOfDay: number;
  label: string;
  intensity: number;
  requests: number;
  tokens: number;
}

export interface SchedulerUsageWindow {
  startTime: string;
  endTime: string;
  activeDays: number;
  requests: number;
  tokens: number;
  intensity: number;
}

export interface SchedulerRecommendation {
  recommendedAnchorTime: string;
  expectedFirstRefreshTime: string;
  expectedSecondRefreshTime: string;
  expectedThirdRefreshTime: string;
  benefitScore: number;
  reason: string;
  highIntensityWindows: SchedulerUsageWindow[];
}

export interface SchedulerMaturity {
  activeUsageDays: number;
  totalSessions: number;
  totalRequests: number;
  totalTokens: number;
  weekdayActiveDays: number;
  weekendActiveDays: number;
  confidenceScore: number;
  remainingActiveDaysToOptimal: number;
  estimatedCalendarDaysToOptimal: number;
  level: SchedulerMaturityLevel;
}

export interface SchedulerAnalysis {
  fetchedAt: string;
  accountName?: string;
  maturity: SchedulerMaturity;
  recommendation?: SchedulerRecommendation;
  heatmap: SchedulerHeatmapBucket[];
  warning?: string;
}

export interface SchedulerHistoryEntry {
  id: string;
  accountId?: string;
  accountEmail?: string;
  date: string;
  mode: SchedulerMode;
  recommendedAnchorTime?: string;
  manualAnchorTime?: string;
  finalAnchorTime: string;
  expectedFirstRefreshTime?: string;
  expectedSecondRefreshTime?: string;
  expectedThirdRefreshTime?: string;
  actualTriggerTime?: string;
  beforeUsageSnapshot?: CodexUsageInfo;
  afterUsageSnapshot?: CodexUsageInfo;
  detectedRefreshTime?: string;
  confidenceScore: number;
  benefitScore?: number;
  dataMaturityLevel: SchedulerMaturityLevel;
  activeUsageDays: number;
  resultStatus: SchedulerResultStatus;
  errorMessage?: string;
  createdAt: string;
}

export interface SchedulerState {
  config: SchedulerConfig;
  analysis: SchedulerAnalysis;
  history: SchedulerHistoryEntry[];
  shouldShowInvite: boolean;
}

export interface CodexAuthStatus {
  codexHome: string;
  authPath: string;
  exists: boolean;
  matchedAccount?: string;
  sha256Prefix?: string;
  status: "matched" | "unmatched" | "missing" | "unknown";
  warning?: string;
}

export interface AppLog {
  id: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export interface AppSettings {
  codexHome?: string;
  autoDetectCodexHome: boolean;
  refreshUsageOnStartup: boolean;
  refreshUsageAfterSwitch: boolean;
  refreshUsageIntervalMinutes: number;
  restorePreviousAfterUsageCheck: boolean;
  backupRetention: number;
  enableUsageQuery: boolean;
  enableUsageNotifications: boolean;
  usageNotificationThreshold: number;
  theme: "system" | "light" | "dark";
}

export interface AppState {
  activeAccount?: string;
  selectedAccount?: string;
  authStatus: CodexAuthStatus;
  accounts: AccountMeta[];
  logs: AppLog[];
  settings: AppSettings;
  switchHistory: SwitchHistoryEntry[];
  scheduler: SchedulerState;
  proxyState: ProxyState;
}

export interface RefreshProgress {
  current: number;
  total: number;
  currentName: string;
  succeeded: number;
  failed: number;
  done: boolean;
}

export interface ToastItem {
  id: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}
