# Phase 2 Acceptance Matrix

This document tracks the second-stage proxy mode acceptance status for Codex Switcher.

Status legend:

- `Done`: implemented and covered by automated tests or direct source evidence.
- `Needs E2E`: implemented, but still needs real application / packaged build verification.
- `Follow-up`: not required to block the current phase, or needs a separate product decision.

## Current Completion

Estimated completion: `88%-90%`.

The remaining gap is mainly verification depth, not core implementation. The proxy, provider routing, failover, protocol conversion, mobile residency, and persistent operation logs are implemented. The highest-risk remaining work is a full real-app end-to-end pass and final Tauri package build.

## Core Proxy

| Requirement | Status | Evidence |
| --- | --- | --- |
| Local proxy listens on configurable localhost address, defaulting to `127.0.0.1:14550` | Done | `ProxyConfig::default`, `validate_proxy_config`, `start_proxy`, tests `save_proxy_config_accepts_valid_listen_address`, `save_proxy_config_rejects_invalid_listen_address_without_overwriting` |
| Proxy lifecycle start / stop | Done | `start_proxy`, `stop_proxy`, test `start_and_stop_proxy_manage_codex_config` |
| Codex `chatgpt_base_url` install / restore | Done | `codex_config.rs`, tests `install_and_restore_preserves_other_fields`, `restore_preserves_user_changes_after_install`, `start_and_stop_proxy_manage_codex_config` |
| Proxy startup restore | Done | `restore_proxy_on_startup`, test `startup_restore_starts_proxy_and_restores_mobile_residency` |
| HTTP forwarding | Done | `proxy_request`, `forward_once`, test `proxy_forwards_responses_to_chat_completions_provider` |
| SSE forwarding and conversion | Done | `response_from_reqwest`, `ChatCompletionSseTransformer`, tests `proxy_buffers_split_chat_sse_chunks`, `proxy_records_broken_sse_stream_after_headers` |
| WebSocket forwarding | Done | `proxy_websocket`, test `proxy_bridges_websocket_messages` |
| Synthetic `/v1/models` response | Done | `synthetic_models_response`, test `proxy_returns_synthetic_models_without_configured_provider` |
| Real app startup verification | Needs E2E | Not yet re-run after the latest proxy changes |

## Providers

| Requirement | Status | Evidence |
| --- | --- | --- |
| ChatGPT OAuth account providers | Done | `oauth_provider_for_account`, `merged_providers_only_wraps_chatgpt_oauth_accounts` |
| OpenAI API Key / compatible relay providers | Done | `ProviderKind::OpenAiApiKey`, `ProviderKind::OpenAiCompatible`, provider save/update tests |
| GLM, MiMo, DeepSeek providers | Done | `ProviderKind::{Glm,Mimo,DeepSeek}`, `SettingsDrawer` provider presets |
| Custom Chat Completions backend | Done | `ProviderKind::CustomChatCompletions`, proxy conversion tests |
| Secret redaction in public provider state | Done | `public_provider_hides_api_key`, `public_provider_exposes_model_map_without_secret`, `set_provider_health_redacts_error` |
| OAuth provider health validation | Done | `check_provider_health`, tests `check_oauth_provider_health_uses_account_health`, `check_oauth_provider_health_logs_missing_account` |
| Third-party health checks via `/v1/models` | Done | `check_provider_health_updates_status`, `check_provider_health_marks_auth_failure_invalid` |

## Routing And Failover

| Requirement | Status | Evidence |
| --- | --- | --- |
| Manual request provider selection | Done | `set_request_provider`, tests `setting_manual_request_provider_does_not_require_failover_membership`, `set_request_provider_records_mobile_residency_context` |
| Automatic failover setting | Done | `RoutingPolicy::automatic_failover`, `proxy_failovers_after_quota_response`, `proxy_does_not_record_failover_when_disabled` |
| Failover only for retryable failures | Done | `is_retryable_proxy_error`, test `proxy_does_not_failover_on_unclassified_upstream_error` |
| No replay for unsafe unknown POST paths | Done | `is_replay_safe_request`, test `proxy_does_not_replay_unknown_post_paths` |
| Third-party failover gate | Done | `allow_third_party_failover`, routing tests `skips_third_party_when_not_allowed`, `explicit_third_party_provider_is_not_blocked_by_failover_gate` |
| Provider cooldown / failure health update | Done | `mark_provider_failure`, `ProviderHealthStatus::CoolingDown` |
| Failover logs | Done | `record_failover`, persistent app logs, test `proxy_failovers_after_quota_response` |
| SSE after-start failure recording without destructive replay | Done | `record_stream_failure`, test `proxy_records_broken_sse_stream_after_headers` |

## Protocol Conversion

| Requirement | Status | Evidence |
| --- | --- | --- |
| Responses to Chat Completions conversion | Done | `responses_to_chat_completions`, test `converts_responses_input_to_chat_messages` |
| Model override / model map | Done | `mapped_model`, test `maps_model_when_provider_has_override` |
| `max_output_tokens` to `max_tokens` | Done | `converts_responses_input_to_chat_messages` |
| Reasoning config preservation | Done | `preserves_reasoning_config_in_chat_request` |
| Function tools conversion | Done | `converts_response_tools_to_chat_function_tools` |
| Function call input conversion | Done | `converts_function_call_input_to_assistant_tool_call` |
| Function call output conversion | Done | `converts_function_call_output_to_tool_message` |
| Image content conversion | Done | `preserves_image_content_parts_for_chat_providers` |
| File content reference conversion without inline file data | Done | `converts_file_content_parts_to_text_references` |
| Chat Completions non-stream response to Responses | Done | `converts_chat_completion_response_to_responses_json` |
| Chat Completions stream text delta to Responses SSE | Done | `converts_chat_stream_delta_to_responses_event` |
| Chat Completions stream reasoning delta to Responses SSE | Done | `converts_reasoning_stream_delta_to_responses_event` |
| Chat Completions stream tool call deltas to Responses SSE | Done | `converts_tool_call_stream_delta_to_responses_event`, `converts_tool_call_argument_stream_delta_without_readding_item` |
| Split SSE line buffering | Done | `ChatCompletionSseTransformer`, `buffers_split_chat_sse_lines_before_converting`, `proxy_buffers_split_chat_sse_chunks` |
| Vendor-specific nonstandard streaming variants | Follow-up | Needs provider-specific samples from real GLM / MiMo / DeepSeek responses |

## Mobile Residency

| Requirement | Status | Evidence |
| --- | --- | --- |
| Feature name uses `移动端驻留` | Done | UI and backend messages use mobile residency naming |
| Only ChatGPT OAuth accounts can be selected | Done | `validate_mobile_residency_account`, `merged_providers_only_wraps_chatgpt_oauth_accounts` |
| Enable / disable / clear / restore | Done | `set_mobile_residency_account`, `enable_mobile_residency`, `disable_mobile_residency`, `clear_mobile_residency`, `restore_mobile_residency` |
| Startup restore | Done | `restore_proxy_on_startup`, test `startup_restore_starts_proxy_and_restores_mobile_residency` |
| Dashboard state includes residency account, disk account, request provider | Done | `MobileResidencyState`, `MainArea` |
| Warning when disk account differs from residency account | Done | `mobile_residency_state` |
| Settings UI section | Done | `SettingsDrawer` mobile residency section |
| Account card entry / marker | Done | `AccountPool` mobile residency action |
| Operation logs | Done | persistent app logs in `core::append_app_log`, proxy mobile residency commands |

## Safety

| Requirement | Status | Evidence |
| --- | --- | --- |
| Do not expose provider secrets to frontend | Done | `public_provider`, `hasSecret` only |
| Redact secret-like log content | Done | `sanitize_message`, `app_logs_are_persisted_and_sanitized` |
| Do not log request body / auth JSON / token contents | Done | request logs store method, path, provider, status, error only |
| Do not force automatic failover by default | Done | `RoutingPolicy::default` has `automatic_failover: false` |
| Do not include third-party providers in failover unless enabled | Done | `allow_third_party_failover: false` default and routing tests |
| Do not replay unsafe side-effect paths | Done | `proxy_does_not_replay_unknown_post_paths` |

## Frontend

| Requirement | Status | Evidence |
| --- | --- | --- |
| Proxy settings UI | Done | `SettingsDrawer` local proxy and routing sections |
| Provider management UI | Done | `SettingsDrawer` provider form and list |
| Dashboard proxy state card | Done | `MainArea` proxy / failover / residency cards |
| Tray proxy state summary | Done | `TrayMenu` |
| Existing account switching still available when proxy is disabled | Needs E2E | Core account switch logic remains, but latest proxy changes need a manual regression pass |

## Required Verification Gates

| Gate | Status | Last Known Result |
| --- | --- | --- |
| `cargo test` | Done | 73 tests passed after commit `4404770` |
| `cargo build` | Done | Passed after commit `4404770` |
| `npm run build` | Done | Passed after commit `4404770` |
| `git diff --check` | Done | Passed after commit `4404770` |
| `npm exec tauri -- build` | Needs E2E | Not yet re-run after latest commits |
| Real app startup verification | Needs E2E | Not yet re-run after latest commits |
| Real proxy request through app / CLI | Needs E2E | Not yet re-run after latest commits |

## Remaining Before Claiming Phase 2 Complete

1. Run final full verification:
   - `cargo test`
   - `cargo build`
   - `npm run build`
   - `npm exec tauri -- build`
2. Launch the built app once and verify startup does not regress.
3. Start proxy from the UI or command path and verify `chatgpt_base_url` install / restore on a disposable Codex home.
4. Send at least one mock or controlled request through the local proxy after app startup.
5. Re-check logs for absence of token, auth JSON, request body, or provider secrets.

Only after these gates pass should the phase be marked complete.
