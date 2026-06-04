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
  theme: "system" | "light" | "dark";
}

export interface AppState {
  activeAccount?: string;
  selectedAccount?: string;
  authStatus: CodexAuthStatus;
  accounts: AccountMeta[];
  logs: AppLog[];
  settings: AppSettings;
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
