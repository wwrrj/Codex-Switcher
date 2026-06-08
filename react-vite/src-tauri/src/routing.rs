use chrono::{DateTime, Utc};

use crate::models::*;

#[derive(Debug, Clone)]
pub struct RouteDecision {
    pub provider: ProviderConfig,
}

#[derive(Debug, Clone, PartialEq)]
pub enum FailureKind {
    Auth,
    Quota,
    RateLimit,
    Capacity,
    Unknown,
}

pub fn classify_failure(status: Option<u16>, body: &str) -> Option<FailureKind> {
    let body_l = body.to_lowercase();
    match status {
        Some(401) | Some(403) => Some(FailureKind::Auth),
        Some(429) => {
            if body_l.contains("quota") || body_l.contains("exhausted") {
                Some(FailureKind::Quota)
            } else {
                Some(FailureKind::RateLimit)
            }
        }
        Some(500..=599) => Some(FailureKind::Capacity),
        _ if body_l.contains("quota")
            || body_l.contains("exhausted")
            || body_l.contains("insufficient_quota") =>
        {
            Some(FailureKind::Quota)
        }
        _ if body_l.contains("rate limit") || body_l.contains("too many requests") => {
            Some(FailureKind::RateLimit)
        }
        _ if body_l.contains("capacity") || body_l.contains("overloaded") => {
            Some(FailureKind::Capacity)
        }
        _ if body_l.contains("invalid token") || body_l.contains("unauthorized") => {
            Some(FailureKind::Auth)
        }
        _ => None,
    }
}

pub fn is_provider_available(provider: &ProviderConfig, allow_third_party: bool) -> bool {
    if !provider.enabled || !provider.include_in_failover {
        return false;
    }
    let is_third_party = matches!(
        provider.kind,
        ProviderKind::Glm
            | ProviderKind::Mimo
            | ProviderKind::DeepSeek
            | ProviderKind::CustomChatCompletions
    );
    if is_third_party && !allow_third_party {
        return false;
    }
    if provider.health.status == ProviderHealthStatus::Disabled
        || provider.health.status == ProviderHealthStatus::Invalid
    {
        return false;
    }
    if let Some(until) = &provider.health.cooldown_until {
        if DateTime::parse_from_rfc3339(until)
            .map(|dt| dt.with_timezone(&Utc) > Utc::now())
            .unwrap_or(false)
        {
            return false;
        }
    }
    true
}

pub fn choose_provider(
    providers: &[ProviderConfig],
    policy: &RoutingPolicy,
    previous_provider_ids: &[String],
) -> Option<RouteDecision> {
    if let Some(id) = &policy.request_provider_id {
        if let Some(provider) = providers.iter().find(|item| &item.id == id) {
            if !previous_provider_ids.contains(&provider.id)
                && is_provider_available(provider, policy.allow_third_party_failover)
            {
                return Some(RouteDecision {
                    provider: provider.clone(),
                });
            }
        }
    }

    let mut candidates = providers
        .iter()
        .filter(|provider| !previous_provider_ids.contains(&provider.id))
        .filter(|provider| is_provider_available(provider, policy.allow_third_party_failover))
        .cloned()
        .collect::<Vec<_>>();
    candidates.sort_by(|a, b| {
        provider_rank(a)
            .cmp(&provider_rank(b))
            .then_with(|| last_used_sort_key(&a.health).cmp(&last_used_sort_key(&b.health)))
            .then_with(|| a.id.cmp(&b.id))
    });
    candidates
        .into_iter()
        .next()
        .map(|provider| RouteDecision { provider })
}

fn provider_rank(provider: &ProviderConfig) -> u8 {
    match provider.health.status {
        ProviderHealthStatus::Healthy => 0,
        ProviderHealthStatus::Unknown => 1,
        ProviderHealthStatus::CoolingDown => 2,
        ProviderHealthStatus::Disabled | ProviderHealthStatus::Invalid => 9,
    }
}

fn last_used_sort_key(health: &ProviderHealth) -> i64 {
    health
        .last_used_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|dt| dt.timestamp())
        .unwrap_or(0)
}

pub fn failure_reason(kind: &FailureKind) -> &'static str {
    match kind {
        FailureKind::Auth => "认证失败",
        FailureKind::Quota => "额度耗尽",
        FailureKind::RateLimit => "频率限制",
        FailureKind::Capacity => "上游容量异常",
        FailureKind::Unknown => "未知错误",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(id: &str, kind: ProviderKind) -> ProviderConfig {
        ProviderConfig {
            id: id.to_string(),
            name: id.to_string(),
            kind,
            enabled: true,
            base_url: "https://example.com/v1".to_string(),
            account_name: None,
            api_key: None,
            model_map: None,
            include_in_failover: true,
            health: ProviderHealth {
                status: ProviderHealthStatus::Healthy,
                ..ProviderHealth::default()
            },
        }
    }

    #[test]
    fn classifies_quota_and_rate_limit() {
        assert_eq!(
            classify_failure(Some(429), "quota exhausted"),
            Some(FailureKind::Quota)
        );
        assert_eq!(
            classify_failure(Some(429), "too many requests"),
            Some(FailureKind::RateLimit)
        );
        assert_eq!(classify_failure(Some(401), ""), Some(FailureKind::Auth));
    }

    #[test]
    fn skips_third_party_when_not_allowed() {
        let providers = vec![
            provider("deepseek", ProviderKind::DeepSeek),
            provider("oauth", ProviderKind::ChatGptOauth),
        ];
        let policy = RoutingPolicy {
            allow_third_party_failover: false,
            ..RoutingPolicy::default()
        };
        let decision = choose_provider(&providers, &policy, &[]).unwrap();
        assert_eq!(decision.provider.id, "oauth");
    }

    #[test]
    fn prefers_healthy_provider_over_unknown() {
        let mut unknown = provider("unknown", ProviderKind::OpenAiCompatible);
        unknown.health.status = ProviderHealthStatus::Unknown;
        let healthy = provider("healthy", ProviderKind::OpenAiCompatible);
        let decision =
            choose_provider(&[unknown, healthy], &RoutingPolicy::default(), &[]).unwrap();
        assert_eq!(decision.provider.id, "healthy");
    }

    #[test]
    fn prefers_least_recently_used_when_health_matches() {
        let mut old = provider("old", ProviderKind::OpenAiCompatible);
        old.health.last_used_at = Some("2026-01-01T00:00:00Z".to_string());
        let mut recent = provider("recent", ProviderKind::OpenAiCompatible);
        recent.health.last_used_at = Some("2026-06-01T00:00:00Z".to_string());
        let decision = choose_provider(&[recent, old], &RoutingPolicy::default(), &[]).unwrap();
        assert_eq!(decision.provider.id, "old");
    }

    #[test]
    fn explicit_request_provider_still_wins() {
        let mut unknown = provider("unknown", ProviderKind::OpenAiCompatible);
        unknown.health.status = ProviderHealthStatus::Unknown;
        let healthy = provider("healthy", ProviderKind::OpenAiCompatible);
        let policy = RoutingPolicy {
            request_provider_id: Some("unknown".to_string()),
            ..RoutingPolicy::default()
        };
        let decision = choose_provider(&[healthy, unknown], &policy, &[]).unwrap();
        assert_eq!(decision.provider.id, "unknown");
    }
}
