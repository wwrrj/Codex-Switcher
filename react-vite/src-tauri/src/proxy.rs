use anyhow::{Context, Result};
use axum::body::{to_bytes, Body};
use axum::extract::ws::{Message as AxumWsMessage, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{HeaderMap, Method, Request, Response, StatusCode};
use axum::response::IntoResponse;
use axum::routing::any;
use axum::Router;
use bytes::Bytes;
use chrono::Utc;
use futures_util::TryStreamExt;
use futures_util::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use reqwest::header::{HeaderName, HeaderValue, AUTHORIZATION, CONTENT_LENGTH, HOST};
use std::fmt;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tokio::sync::oneshot;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;

use crate::codex_config;
use crate::core;
use crate::mobile_residency;
use crate::models::*;
use crate::providers;
use crate::routing;
use crate::secrets::sanitize_message;
use crate::transforms;

static RUNTIME: Lazy<Mutex<Option<ProxyRuntime>>> = Lazy::new(|| Mutex::new(None));

struct ProxyRuntime {
    listen_url: String,
    shutdown: Option<oneshot::Sender<()>>,
}

#[derive(Clone)]
struct ProxyAppState {
    home: PathBuf,
    client: reqwest::Client,
}

#[derive(Debug)]
struct UpstreamFailure {
    reason: String,
    status_code: Option<u16>,
}

impl fmt::Display for UpstreamFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.reason)
    }
}

impl std::error::Error for UpstreamFailure {}

fn config_dir(home: &Path) -> PathBuf {
    home.join("config")
}

fn proxy_config_file(home: &Path) -> PathBuf {
    config_dir(home).join("proxy.json")
}

fn failovers_file(home: &Path) -> PathBuf {
    config_dir(home).join("proxy_failovers.json")
}

fn requests_file(home: &Path) -> PathBuf {
    config_dir(home).join("proxy_requests.json")
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T> {
    Ok(serde_json::from_str(&std::fs::read_to_string(path)?)?)
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn listen_url_for_config(config: &ProxyConfig) -> String {
    format!("http://{}:{}", config.host, config.port)
}

fn shutdown_runtime_only() {
    if let Some(mut runtime) = RUNTIME.lock().unwrap().take() {
        if let Some(shutdown) = runtime.shutdown.take() {
            let _ = shutdown.send(());
        }
    }
}

pub fn load_proxy_config(home: &Path) -> Result<ProxyConfig> {
    let path = proxy_config_file(home);
    if !path.exists() {
        return Ok(ProxyConfig::default());
    }
    Ok(read_json(&path)?)
}

fn validate_proxy_config(config: &ProxyConfig) -> Result<()> {
    let host = config.host.trim();
    if host.is_empty() {
        anyhow::bail!("代理监听地址不能为空");
    }
    if host != config.host {
        anyhow::bail!("代理监听地址不能包含前后空格");
    }
    format!("{}:{}", config.host, config.port)
        .parse::<SocketAddr>()
        .with_context(|| format!("代理监听地址无效: {}:{}", config.host, config.port))?;
    Ok(())
}

fn validate_request_provider(home: &Path, provider_id: &str) -> Result<()> {
    let accounts = core::list_accounts(home).unwrap_or_default();
    let provider = providers::merged_providers(home, &accounts)?
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| anyhow::anyhow!("请求出口不存在：{}", provider_id))?;
    if !routing::is_explicit_provider_available(&provider) {
        return Err(anyhow::anyhow!("请求出口不可用：{}", provider.name));
    }
    Ok(())
}

fn clear_unavailable_request_provider(home: &Path) -> Result<()> {
    let mut config = load_proxy_config(home)?;
    let Some(provider_id) = config.routing.request_provider_id.clone() else {
        return Ok(());
    };
    if validate_request_provider(home, &provider_id).is_err() {
        config.routing.request_provider_id = None;
        save_proxy_config(home, &config)?;
    }
    Ok(())
}

pub fn save_proxy_config(home: &Path, config: &ProxyConfig) -> Result<()> {
    validate_proxy_config(config)?;
    write_json(&proxy_config_file(home), config)
}

fn load_failovers(home: &Path) -> Vec<FailoverEvent> {
    let path = failovers_file(home);
    read_json(&path).unwrap_or_default()
}

fn append_failover(home: &Path, event: FailoverEvent) {
    let mut events = load_failovers(home);
    events.insert(0, event);
    events.truncate(50);
    let _ = write_json(&failovers_file(home), &events);
}

fn load_requests(home: &Path) -> Vec<ProxyRequestEvent> {
    let path = requests_file(home);
    read_json(&path).unwrap_or_default()
}

fn append_request(home: &Path, event: ProxyRequestEvent) {
    let mut events = load_requests(home);
    events.insert(0, event);
    events.truncate(100);
    let _ = write_json(&requests_file(home), &events);
}

pub fn get_proxy_state(home: &Path) -> Result<ProxyState> {
    let mut config = load_proxy_config(home)?;
    let mut warnings = Vec::new();
    if let Some(provider_id) = config.routing.request_provider_id.clone() {
        if validate_request_provider(home, &provider_id).is_err() {
            config.routing.request_provider_id = None;
            save_proxy_config(home, &config)?;
            warnings.push("当前请求出口不可用，已恢复默认路由".to_string());
        }
    }
    let accounts = core::list_accounts(home).unwrap_or_default();
    let providers = providers::merged_providers(home, &accounts)?;
    let public_providers = providers
        .iter()
        .map(providers::public_provider)
        .collect::<Vec<_>>();
    let request_provider = config
        .routing
        .request_provider_id
        .as_ref()
        .and_then(|id| providers.iter().find(|item| &item.id == id))
        .map(providers::public_provider);
    let disk_account = accounts
        .iter()
        .find(|account| account.is_active == Some(true))
        .map(|account| account.name.clone());
    let request_provider_name = request_provider
        .as_ref()
        .map(|provider| provider.name.clone())
        .or_else(|| disk_account.clone());
    let mobile_residency = mobile_residency::mobile_residency_state(
        home,
        &config,
        disk_account,
        request_provider_name,
    );
    let runtime = RUNTIME.lock().ok().and_then(|guard| {
        guard
            .as_ref()
            .map(|runtime| (runtime.listen_url.clone(), true))
    });
    let status = if runtime.is_some() {
        ProxyRuntimeStatus::Running
    } else if config.enabled {
        ProxyRuntimeStatus::Stopped
    } else {
        ProxyRuntimeStatus::Stopped
    };
    if config.enabled && !runtime.as_ref().is_some_and(|(_, running)| *running) {
        warnings.push("代理已启用但当前未运行".to_string());
    }
    let codex_config = codex_config::inspect_proxy_config(home, &config.host, config.port);
    if let Some(error) = &codex_config.error {
        warnings.push(error.clone());
    } else if config.install_codex_config && !codex_config.installed {
        match &codex_config.current_base_url {
            Some(url) => warnings.push(format!("Codex 配置当前指向 {url}，未接管到本地代理")),
            None => warnings.push("Codex 配置缺少 chatgpt_base_url，未接管到本地代理".to_string()),
        }
    }

    Ok(ProxyState {
        status,
        listen_url: runtime.map(|(url, _)| url),
        config,
        codex_config,
        request_provider,
        providers: public_providers,
        mobile_residency,
        recent_failovers: load_failovers(home),
        recent_requests: load_requests(home),
        warnings,
    })
}

pub async fn start_proxy(home: PathBuf) -> Result<ProxyState> {
    let mut config = load_proxy_config(&home)?;
    let desired_listen_url = listen_url_for_config(&config);

    if RUNTIME
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|runtime| runtime.listen_url == desired_listen_url)
    {
        config.enabled = true;
        codex_config::install_proxy_config(&home, &config.host, config.port)?;
        config.install_codex_config = true;
        save_proxy_config(&home, &config)?;
        return get_proxy_state(&home);
    }
    shutdown_runtime_only();

    let addr: SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .context("代理监听地址无效")?;
    let state = ProxyAppState {
        home: home.clone(),
        client: reqwest::Client::new(),
    };
    let app = Router::new()
        .route("/", any(proxy_handler))
        .route("/*path", any(proxy_handler))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("代理端口绑定失败: {}", addr))?;
    config.enabled = true;
    codex_config::install_proxy_config(&home, &config.host, config.port)?;
    config.install_codex_config = true;
    save_proxy_config(&home, &config)?;
    let (tx, rx) = oneshot::channel();
    let server = axum::serve(listener, app).with_graceful_shutdown(async {
        let _ = rx.await;
    });
    tauri::async_runtime::spawn(async move {
        if let Err(error) = server.await {
            log::error!("proxy server stopped with error: {}", error);
        }
    });

    *RUNTIME.lock().unwrap() = Some(ProxyRuntime {
        listen_url: desired_listen_url,
        shutdown: Some(tx),
    });
    get_proxy_state(&home)
}

pub async fn update_proxy_config(home: PathBuf, mut config: ProxyConfig) -> Result<ProxyState> {
    validate_proxy_config(&config)?;
    if let Some(provider_id) = config.routing.request_provider_id.as_deref() {
        if validate_request_provider(&home, provider_id).is_err() {
            config.routing.request_provider_id = None;
        }
    }
    let runtime_url = RUNTIME
        .lock()
        .unwrap()
        .as_ref()
        .map(|runtime| runtime.listen_url.clone());
    let desired_listen_url = listen_url_for_config(&config);

    if !config.enabled {
        if runtime_url.is_some() {
            shutdown_runtime_only();
            let _ = codex_config::restore_proxy_config(&home)?;
        }
        config.install_codex_config = false;
        save_proxy_config(&home, &config)?;
        return get_proxy_state(&home);
    }

    save_proxy_config(&home, &config)?;
    if runtime_url.as_deref() != Some(desired_listen_url.as_str()) {
        shutdown_runtime_only();
        return start_proxy(home).await;
    }
    if config.install_codex_config {
        codex_config::install_proxy_config(&home, &config.host, config.port)?;
    }
    get_proxy_state(&home)
}

pub async fn restore_proxy_on_startup(home: PathBuf) -> Result<ProxyState> {
    let config = load_proxy_config(&home)?;
    if config.mobile_residency.enabled && config.mobile_residency.restore_on_startup {
        let account = config
            .mobile_residency
            .account_name
            .clone()
            .ok_or_else(|| anyhow::anyhow!("移动端驻留已启用，但未选择账号"))?;
        mobile_residency::restore_mobile_residency_auth(&home, &account)?;
        log::info!("mobile residency restored on startup");
    }
    if config.enabled {
        return start_proxy(home).await;
    }
    get_proxy_state(&home)
}

pub fn stop_proxy(home: &Path) -> Result<ProxyState> {
    shutdown_runtime_only();
    let mut config = load_proxy_config(home)?;
    config.enabled = false;
    let _ = codex_config::restore_proxy_config(home)?;
    config.install_codex_config = false;
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn set_request_provider(home: &Path, provider_id: Option<String>) -> Result<ProxyState> {
    if let Some(provider_id) = provider_id.as_deref() {
        validate_request_provider(home, provider_id)?;
    }
    let mut config = load_proxy_config(home)?;
    config.routing.request_provider_id = provider_id;
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn save_provider(home: &Path, provider: ProviderConfig) -> Result<ProxyState> {
    providers::save_provider(home, provider)?;
    clear_unavailable_request_provider(home)?;
    get_proxy_state(home)
}

pub fn remove_provider(home: &Path, provider_id: &str) -> Result<ProxyState> {
    providers::remove_provider(home, provider_id)?;
    let mut config = load_proxy_config(home)?;
    if config.routing.request_provider_id.as_deref() == Some(provider_id) {
        config.routing.request_provider_id = None;
        save_proxy_config(home, &config)?;
    }
    get_proxy_state(home)
}

pub fn update_provider_options(
    home: &Path,
    provider_id: &str,
    enabled: Option<bool>,
    include_in_failover: Option<bool>,
) -> Result<ProxyState> {
    providers::update_provider_options(home, provider_id, enabled, include_in_failover)?;
    clear_unavailable_request_provider(home)?;
    get_proxy_state(home)
}

pub fn clear_proxy_events(home: &Path) -> Result<ProxyState> {
    let _ = std::fs::remove_file(failovers_file(home));
    let _ = std::fs::remove_file(requests_file(home));
    get_proxy_state(home)
}

pub async fn check_provider_health(home: PathBuf, provider_id: String) -> Result<ProxyState> {
    let accounts = core::list_accounts(&home).unwrap_or_default();
    let provider = providers::merged_providers(&home, &accounts)?
        .into_iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| anyhow::anyhow!("请求出口不存在：{}", provider_id))?;

    if provider.kind == ProviderKind::ChatGptOauth {
        if let Some(account) = &provider.account_name {
            providers::read_access_token_for_account(&home, account)?;
        }
        return get_proxy_state(&home);
    }

    let url = upstream_url(&provider, "/v1/models", None);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .build()?;
    let mut request = client.get(url);
    if let Some(auth) = provider_auth_header(&home, &provider)? {
        request = request.header(AUTHORIZATION, auth);
    }
    let response = request.send().await;
    let now = Utc::now().to_rfc3339();
    let health = match response {
        Ok(response) if response.status().is_success() => ProviderHealth {
            status: ProviderHealthStatus::Healthy,
            last_error: None,
            last_used_at: Some(now),
            cooldown_until: None,
        },
        Ok(response) => {
            let status = response.status().as_u16();
            let health_status = match status {
                401 | 403 => ProviderHealthStatus::Invalid,
                429 | 500..=599 => ProviderHealthStatus::CoolingDown,
                _ => ProviderHealthStatus::Unknown,
            };
            ProviderHealth {
                status: health_status,
                last_error: Some(format!("健康检查失败：HTTP {status}")),
                last_used_at: Some(now),
                cooldown_until: None,
            }
        }
        Err(error) => ProviderHealth {
            status: ProviderHealthStatus::Invalid,
            last_error: Some(format!(
                "健康检查失败：{}",
                sanitize_message(&error.to_string())
            )),
            last_used_at: Some(now),
            cooldown_until: None,
        },
    };
    providers::set_provider_health(&home, &provider.id, health)?;
    clear_unavailable_request_provider(&home)?;
    get_proxy_state(&home)
}

pub async fn check_all_provider_health(home: PathBuf) -> Result<ProxyState> {
    let provider_ids = providers::load_provider_configs(&home)?
        .into_iter()
        .map(|provider| provider.id)
        .collect::<Vec<_>>();
    for provider_id in provider_ids {
        check_provider_health(home.clone(), provider_id).await?;
    }
    get_proxy_state(&home)
}

pub fn install_codex_proxy_config(home: &Path) -> Result<ProxyState> {
    let mut config = load_proxy_config(home)?;
    codex_config::install_proxy_config(home, &config.host, config.port)?;
    config.install_codex_config = true;
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn restore_codex_proxy_config(home: &Path) -> Result<ProxyState> {
    let mut config = load_proxy_config(home)?;
    let _ = codex_config::restore_proxy_config(home)?;
    config.install_codex_config = false;
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn set_mobile_residency_account(home: &Path, account_name: String) -> Result<ProxyState> {
    mobile_residency::validate_mobile_residency_account(home, &account_name)?;
    let mut config = load_proxy_config(home)?;
    config.mobile_residency.account_name = Some(account_name);
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn enable_mobile_residency(home: &Path) -> Result<ProxyState> {
    let mut config = load_proxy_config(home)?;
    let account = config
        .mobile_residency
        .account_name
        .clone()
        .ok_or_else(|| anyhow::anyhow!("请先选择移动端驻留账号"))?;
    mobile_residency::restore_mobile_residency_auth(home, &account)?;
    config.mobile_residency.enabled = true;
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn disable_mobile_residency(home: &Path) -> Result<ProxyState> {
    let mut config = load_proxy_config(home)?;
    config.mobile_residency.enabled = false;
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn clear_mobile_residency(home: &Path) -> Result<ProxyState> {
    let mut config = load_proxy_config(home)?;
    config.mobile_residency.enabled = false;
    config.mobile_residency.account_name = None;
    save_proxy_config(home, &config)?;
    get_proxy_state(home)
}

pub fn restore_mobile_residency(home: &Path) -> Result<ProxyState> {
    let config = load_proxy_config(home)?;
    let account = config
        .mobile_residency
        .account_name
        .clone()
        .ok_or_else(|| anyhow::anyhow!("未选择移动端驻留账号"))?;
    mobile_residency::restore_mobile_residency_auth(home, &account)?;
    get_proxy_state(home)
}

async fn proxy_handler(
    State(state): State<ProxyAppState>,
    ws: Option<WebSocketUpgrade>,
    req: Request<Body>,
) -> impl IntoResponse {
    if let Some(ws) = ws {
        return ws
            .on_upgrade(move |socket| async move {
                if let Err(error) = proxy_websocket(state, socket, req).await {
                    log::warn!(
                        "websocket proxy failed: {}",
                        sanitize_message(&error.to_string())
                    );
                }
            })
            .into_response();
    }
    match proxy_request(state, req).await {
        Ok(response) => response,
        Err(error) => response_with_status(
            StatusCode::BAD_GATEWAY,
            format!("代理请求失败：{}", sanitize_message(&error.to_string())),
        ),
    }
}

async fn proxy_websocket(
    state: ProxyAppState,
    client_socket: WebSocket,
    req: Request<Body>,
) -> Result<()> {
    let started = Instant::now();
    let config = load_proxy_config(&state.home)?;
    let accounts = core::list_accounts(&state.home).unwrap_or_default();
    let providers = providers::merged_providers(&state.home, &accounts)?;
    let uri = req.uri().clone();
    let path = uri.path().to_string();
    let query = uri.query().map(str::to_string);
    let Some(provider) = routing::choose_provider(&providers, &config.routing, &[])
        .map(|decision| decision.provider)
    else {
        record_request(
            &state.home,
            None,
            &Method::GET,
            &path,
            None,
            false,
            0,
            started.elapsed().as_millis(),
            true,
            Some("没有可用 WebSocket 请求出口".to_string()),
        );
        anyhow::bail!("没有可用 WebSocket 请求出口");
    };
    let mut url = upstream_url(&provider, &path, query.as_deref());
    if url.starts_with("https://") {
        url = url.replacen("https://", "wss://", 1);
    } else if url.starts_with("http://") {
        url = url.replacen("http://", "ws://", 1);
    }

    let mut request = url.into_client_request()?;
    if let Some(auth) = provider_auth_header(&state.home, &provider)? {
        request.headers_mut().insert("authorization", auth.parse()?);
    }
    let (upstream_socket, _) = match connect_async(request).await {
        Ok(value) => value,
        Err(error) => {
            record_request(
                &state.home,
                Some(provider.name.clone()),
                &Method::GET,
                &path,
                None,
                false,
                1,
                started.elapsed().as_millis(),
                true,
                Some(sanitize_message(&error.to_string())),
            );
            return Err(error.into());
        }
    };
    record_request(
        &state.home,
        Some(provider.name.clone()),
        &Method::GET,
        &path,
        Some(101),
        true,
        1,
        started.elapsed().as_millis(),
        true,
        None,
    );
    let (mut upstream_write, mut upstream_read) = upstream_socket.split();
    let (mut client_write, mut client_read) = client_socket.split();

    let client_to_upstream = async {
        while let Some(message) = client_read.next().await {
            let message = message?;
            upstream_write.send(axum_to_tungstenite(message)).await?;
        }
        Result::<()>::Ok(())
    };
    let upstream_to_client = async {
        while let Some(message) = upstream_read.next().await {
            let message = message?;
            client_write.send(tungstenite_to_axum(message)).await?;
        }
        Result::<()>::Ok(())
    };

    let result = tokio::select! {
        result = client_to_upstream => result,
        result = upstream_to_client => result,
    };
    if let Err(error) = &result {
        record_request(
            &state.home,
            Some(provider.name.clone()),
            &Method::GET,
            &path,
            None,
            false,
            1,
            started.elapsed().as_millis(),
            true,
            Some(sanitize_message(&error.to_string())),
        );
    }
    result
}

fn axum_to_tungstenite(message: AxumWsMessage) -> TungsteniteMessage {
    match message {
        AxumWsMessage::Text(text) => TungsteniteMessage::Text(text),
        AxumWsMessage::Binary(bytes) => TungsteniteMessage::Binary(bytes),
        AxumWsMessage::Ping(bytes) => TungsteniteMessage::Ping(bytes),
        AxumWsMessage::Pong(bytes) => TungsteniteMessage::Pong(bytes),
        AxumWsMessage::Close(frame) => TungsteniteMessage::Close(frame.map(|frame| {
            tokio_tungstenite::tungstenite::protocol::CloseFrame {
                code: frame.code.into(),
                reason: frame.reason,
            }
        })),
    }
}

fn tungstenite_to_axum(message: TungsteniteMessage) -> AxumWsMessage {
    match message {
        TungsteniteMessage::Text(text) => AxumWsMessage::Text(text),
        TungsteniteMessage::Binary(bytes) => AxumWsMessage::Binary(bytes),
        TungsteniteMessage::Ping(bytes) => AxumWsMessage::Ping(bytes),
        TungsteniteMessage::Pong(bytes) => AxumWsMessage::Pong(bytes),
        TungsteniteMessage::Close(frame) => {
            AxumWsMessage::Close(frame.map(|frame| axum::extract::ws::CloseFrame {
                code: frame.code.into(),
                reason: frame.reason,
            }))
        }
        TungsteniteMessage::Frame(_) => AxumWsMessage::Close(None),
    }
}

async fn proxy_request(state: ProxyAppState, req: Request<Body>) -> Result<Response<Body>> {
    let started = Instant::now();
    let (parts, body) = req.into_parts();
    let method = parts.method;
    let uri = parts.uri;
    let headers = parts.headers;
    let path = uri.path().to_string();
    let query = uri.query().map(str::to_string);
    let body_bytes = to_bytes(body, 20 * 1024 * 1024)
        .await
        .context("读取请求体失败")?;

    if path.ends_with("/models") || path == "/v1/models" {
        let config = load_proxy_config(&state.home)?;
        let accounts = core::list_accounts(&state.home).unwrap_or_default();
        let providers = providers::merged_providers(&state.home, &accounts)?;
        let provider = routing::choose_provider(&providers, &config.routing, &[])
            .map(|decision| decision.provider)
            .or_else(|| providers.into_iter().next());
        let provider_name = provider
            .as_ref()
            .map(|provider| provider.name.clone())
            .unwrap_or_else(|| "Codex Switcher".to_string());
        let models = provider
            .as_ref()
            .and_then(|provider| provider.model_map.as_ref())
            .map(|map| map.values().cloned().collect::<Vec<_>>())
            .unwrap_or_else(default_synthetic_models);
        let value = transforms::synthetic_models_response(&provider_name, &models);
        record_request(
            &state.home,
            provider.as_ref().map(|provider| provider.name.clone()),
            &method,
            &path,
            Some(200),
            true,
            1,
            started.elapsed().as_millis(),
            true,
            None,
        );
        return Ok(json_response(StatusCode::OK, value));
    }

    let mut attempted = Vec::new();
    let mut last_error: Option<anyhow::Error> = None;
    let mut last_provider: Option<String> = None;
    let config = load_proxy_config(&state.home)?;
    let retry_allowed = config.routing.automatic_failover && is_replay_safe_request(&method, &path);
    let max_attempts = if retry_allowed {
        config.routing.max_retries.saturating_add(1)
    } else {
        1
    };

    for attempt_idx in 0..max_attempts {
        let accounts = core::list_accounts(&state.home).unwrap_or_default();
        let provider_list = providers::merged_providers(&state.home, &accounts)?;
        let Some(decision) = routing::choose_provider(&provider_list, &config.routing, &attempted)
        else {
            break;
        };
        let provider = decision.provider;
        last_provider = Some(provider.name.clone());
        attempted.push(provider.id.clone());

        match forward_once(
            &state,
            &provider,
            &method,
            &path,
            query.as_deref(),
            &headers,
            body_bytes.clone(),
        )
        .await
        {
            Ok(response) => {
                let status_code = response.status().as_u16();
                record_request(
                    &state.home,
                    last_provider.clone(),
                    &method,
                    &path,
                    Some(status_code),
                    true,
                    attempted.len() as u8,
                    started.elapsed().as_millis(),
                    retry_allowed,
                    None,
                );
                let _ = providers::mark_provider_used(&state.home, &provider.id);
                return Ok(response);
            }
            Err(error) => {
                let (reason, status_code) = error
                    .downcast_ref::<UpstreamFailure>()
                    .map(|failure| (sanitize_message(&failure.reason), failure.status_code))
                    .unwrap_or_else(|| (sanitize_message(&error.to_string()), None));
                providers::mark_provider_failure(
                    &state.home,
                    &provider.id,
                    &reason,
                    config.routing.cooldown_seconds,
                )
                .ok();
                let next_provider = if attempt_idx + 1 < max_attempts {
                    let accounts = core::list_accounts(&state.home).unwrap_or_default();
                    let provider_list = providers::merged_providers(&state.home, &accounts)?;
                    routing::choose_provider(&provider_list, &config.routing, &attempted)
                        .map(|decision| decision.provider)
                } else {
                    None
                };
                if let Some(next_provider) = next_provider.as_ref() {
                    record_failover(
                        &state.home,
                        &provider,
                        next_provider,
                        &reason,
                        status_code,
                        &method,
                        &path,
                        retry_allowed,
                    );
                }
                last_error = Some(error);
                if attempt_idx + 1 < max_attempts {
                    continue;
                }
            }
        }
    }

    let error = last_error.unwrap_or_else(|| anyhow::anyhow!("没有可用请求出口"));
    let (error_message, status_code) = error
        .downcast_ref::<UpstreamFailure>()
        .map(|failure| (sanitize_message(&failure.reason), failure.status_code))
        .unwrap_or_else(|| (sanitize_message(&error.to_string()), None));
    record_request(
        &state.home,
        last_provider.clone(),
        &method,
        &path,
        status_code,
        false,
        attempted.len() as u8,
        started.elapsed().as_millis(),
        retry_allowed,
        Some(error_message),
    );
    Err(error)
}

fn is_replay_safe_request(method: &Method, path: &str) -> bool {
    if matches!(
        *method,
        Method::GET | Method::HEAD | Method::OPTIONS | Method::TRACE
    ) {
        return true;
    }
    if *method != Method::POST {
        return false;
    }
    let normalized = path.trim_end_matches('/');
    normalized.ends_with("/v1/responses")
        || normalized.ends_with("/responses")
        || normalized.ends_with("/v1/chat/completions")
        || normalized.ends_with("/chat/completions")
}

fn default_synthetic_models() -> Vec<String> {
    vec!["gpt-4.1".to_string(), "gpt-4.1-mini".to_string()]
}

fn record_failover(
    home: &Path,
    from: &ProviderConfig,
    to: &ProviderConfig,
    reason: &str,
    status_code: Option<u16>,
    method: &Method,
    path: &str,
    replay_safe: bool,
) {
    append_failover(
        home,
        FailoverEvent {
            id: uuid::Uuid::new_v4().to_string(),
            time: Utc::now().to_rfc3339(),
            from_provider: from.name.clone(),
            to_provider: Some(to.name.clone()),
            reason: sanitize_message(reason),
            status_code,
            method: Some(method.as_str().to_string()),
            path: Some(path.to_string()),
            replay_safe: Some(replay_safe),
        },
    );
}

fn record_request(
    home: &Path,
    provider: Option<String>,
    method: &Method,
    path: &str,
    status_code: Option<u16>,
    success: bool,
    attempts: u8,
    duration_ms: u128,
    replay_safe: bool,
    error: Option<String>,
) {
    append_request(
        home,
        ProxyRequestEvent {
            id: uuid::Uuid::new_v4().to_string(),
            time: Utc::now().to_rfc3339(),
            provider,
            method: method.as_str().to_string(),
            path: path.to_string(),
            status_code,
            success,
            attempts,
            duration_ms,
            replay_safe,
            error: error.map(|msg| sanitize_message(&msg)),
        },
    );
}

async fn forward_once(
    state: &ProxyAppState,
    provider: &ProviderConfig,
    method: &Method,
    path: &str,
    query: Option<&str>,
    headers: &HeaderMap,
    body: Bytes,
) -> Result<Response<Body>> {
    let upstream_url = upstream_url(provider, path, query);
    let mut upstream_body = body;
    let mut url = upstream_url;
    let mut transform_chat_stream = false;
    if is_chat_completion_provider(provider) && path.ends_with("/responses") {
        let json: serde_json::Value =
            serde_json::from_slice(&upstream_body).context("解析 Responses 请求失败")?;
        let requested_model = json
            .get("model")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("gpt-4.1");
        let model = transforms::mapped_model(requested_model, &provider.model_map);
        upstream_body = Bytes::from(serde_json::to_vec(
            &transforms::responses_to_chat_completions(json, Some(&model)),
        )?);
        url = join_url(&provider.base_url, "/chat/completions", query);
        transform_chat_stream = true;
    }

    let req_method = reqwest::Method::from_bytes(method.as_str().as_bytes())?;
    let mut builder = state.client.request(req_method, url);
    for (name, value) in headers {
        if name == HOST || name == CONTENT_LENGTH || name == AUTHORIZATION {
            continue;
        }
        if let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.as_str().as_bytes()),
            HeaderValue::from_bytes(value.as_bytes()),
        ) {
            builder = builder.header(header_name, header_value);
        }
    }
    if let Some(auth) = provider_auth_header(&state.home, provider)? {
        builder = builder.header(AUTHORIZATION, auth);
    }
    let upstream = builder.body(upstream_body).send().await?;
    let status = upstream.status();
    let headers = upstream.headers().clone();
    let is_sse = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.contains("text/event-stream"));

    if !status.is_success() {
        let status_u16 = status.as_u16();
        let body = upstream.text().await.unwrap_or_default();
        let kind = routing::classify_failure(Some(status_u16), &body)
            .unwrap_or(routing::FailureKind::Unknown);
        return Err(UpstreamFailure {
            reason: format!("{}: HTTP {}", routing::failure_reason(&kind), status_u16),
            status_code: Some(status_u16),
        }
        .into());
    }

    if !is_sse {
        let status_code = StatusCode::from_u16(status.as_u16())?;
        let body = upstream.bytes().await?;
        let body_text = String::from_utf8_lossy(&body);
        if let Some(kind) = routing::classify_failure(Some(status.as_u16()), &body_text) {
            return Err(UpstreamFailure {
                reason: routing::failure_reason(&kind).to_string(),
                status_code: Some(status.as_u16()),
            }
            .into());
        }
        if transform_chat_stream {
            let value: serde_json::Value =
                serde_json::from_slice(&body).context("解析 Chat Completions 响应失败")?;
            let converted = transforms::chat_completion_response_to_responses(value);
            return Ok(json_response(status_code, converted));
        }
        return response_from_parts(status_code, headers, Body::from(body));
    }

    response_from_reqwest(upstream, transform_chat_stream).await
}

fn provider_auth_header(home: &Path, provider: &ProviderConfig) -> Result<Option<String>> {
    match provider.kind {
        ProviderKind::ChatGptOauth => {
            let account = provider
                .account_name
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("OAuth Provider 缺少账号名"))?;
            let token = providers::read_access_token_for_account(home, account)?;
            Ok(Some(format!("Bearer {token}")))
        }
        _ => Ok(provider
            .api_key
            .as_ref()
            .filter(|key| !key.is_empty())
            .map(|key| format!("Bearer {key}"))),
    }
}

fn is_chat_completion_provider(provider: &ProviderConfig) -> bool {
    matches!(
        provider.kind,
        ProviderKind::Glm
            | ProviderKind::Mimo
            | ProviderKind::DeepSeek
            | ProviderKind::CustomChatCompletions
    )
}

fn upstream_url(provider: &ProviderConfig, path: &str, query: Option<&str>) -> String {
    match provider.kind {
        ProviderKind::ChatGptOauth => {
            if path.starts_with("/api/") || path == "/api" {
                return join_url(&url_origin(&provider.base_url), path, query);
            }
            let stripped = path.strip_prefix("/backend-api").unwrap_or(path);
            join_url(&provider.base_url, stripped, query)
        }
        _ => {
            let stripped = path.strip_prefix("/v1").unwrap_or(path);
            join_url(&provider.base_url, stripped, query)
        }
    }
}

fn url_origin(url: &str) -> String {
    let trimmed = url.trim_end_matches('/');
    let Some((scheme, rest)) = trimmed.split_once("://") else {
        return trimmed.to_string();
    };
    let host = rest.split('/').next().unwrap_or(rest);
    format!("{scheme}://{host}")
}

fn join_url(base: &str, path: &str, query: Option<&str>) -> String {
    let base = base.trim_end_matches('/');
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    let mut url = format!("{base}{path}");
    if let Some(query) = query {
        url.push('?');
        url.push_str(query);
    }
    url
}

async fn response_from_reqwest(
    upstream: reqwest::Response,
    transform_chat_stream: bool,
) -> Result<Response<Body>> {
    let status = StatusCode::from_u16(upstream.status().as_u16())?;
    let headers = upstream.headers().clone();
    let is_sse = headers
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.contains("text/event-stream"));
    let mut builder = Response::builder().status(status);
    for (name, value) in &headers {
        if name == reqwest::header::CONTENT_LENGTH || name == reqwest::header::TRANSFER_ENCODING {
            continue;
        }
        builder = builder.header(name.as_str(), value.as_bytes());
    }
    if is_sse {
        if transform_chat_stream {
            let stream = upstream
                .bytes_stream()
                .map_ok(|bytes| {
                    let text = String::from_utf8_lossy(&bytes);
                    let converted = text
                        .lines()
                        .filter_map(transforms::chat_completion_chunk_to_responses_sse)
                        .collect::<String>();
                    Bytes::from(converted)
                })
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error));
            return Ok(builder
                .header("content-type", "text/event-stream")
                .body(Body::from_stream(stream))?);
        }
        let stream = upstream
            .bytes_stream()
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error));
        return Ok(builder.body(Body::from_stream(stream))?);
    }
    let bytes = upstream.bytes().await?;
    if transform_chat_stream {
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).context("解析 Chat Completions 响应失败")?;
        let converted = transforms::chat_completion_response_to_responses(value);
        return Ok(builder
            .header("content-type", "application/json")
            .body(Body::from(converted.to_string()))?);
    }
    Ok(builder.body(Body::from(bytes))?)
}

fn response_from_parts(
    status: StatusCode,
    headers: reqwest::header::HeaderMap,
    body: Body,
) -> Result<Response<Body>> {
    let mut builder = Response::builder().status(status);
    for (name, value) in &headers {
        if name == reqwest::header::CONTENT_LENGTH || name == reqwest::header::TRANSFER_ENCODING {
            continue;
        }
        builder = builder.header(name.as_str(), value.as_bytes());
    }
    Ok(builder.body(body)?)
}

fn response_with_status(status: StatusCode, body: String) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(Body::from(body))
        .unwrap()
}

fn json_response(status: StatusCode, value: serde_json::Value) -> Response<Body> {
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(value.to_string()))
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::{any as route_any, get, post};
    use axum::Json;
    use once_cell::sync::Lazy;

    static TEST_PROXY_MUTEX: Lazy<tokio::sync::Mutex<()>> =
        Lazy::new(|| tokio::sync::Mutex::new(()));

    #[test]
    fn builds_chatgpt_backend_url() {
        let provider = ProviderConfig {
            id: "p".to_string(),
            name: "p".to_string(),
            kind: ProviderKind::ChatGptOauth,
            enabled: true,
            base_url: "https://chatgpt.com/backend-api".to_string(),
            account_name: Some("a".to_string()),
            api_key: None,
            model_map: None,
            include_in_failover: true,
            health: ProviderHealth::default(),
        };
        assert_eq!(
            upstream_url(&provider, "/backend-api/wham/usage", None),
            "https://chatgpt.com/backend-api/wham/usage"
        );
    }

    #[test]
    fn builds_chatgpt_api_url_from_origin() {
        let provider = ProviderConfig {
            id: "p".to_string(),
            name: "p".to_string(),
            kind: ProviderKind::ChatGptOauth,
            enabled: true,
            base_url: "https://chatgpt.com/backend-api".to_string(),
            account_name: Some("a".to_string()),
            api_key: None,
            model_map: None,
            include_in_failover: true,
            health: ProviderHealth::default(),
        };
        assert_eq!(
            upstream_url(&provider, "/api/auth/session", Some("x=1")),
            "https://chatgpt.com/api/auth/session?x=1"
        );
    }

    #[test]
    fn extracts_url_origin_without_path() {
        assert_eq!(
            url_origin("https://chatgpt.com/backend-api/"),
            "https://chatgpt.com"
        );
        assert_eq!(
            url_origin("http://127.0.0.1:14550/v1"),
            "http://127.0.0.1:14550"
        );
    }

    #[test]
    fn builds_openai_compatible_url() {
        let provider = ProviderConfig {
            id: "p".to_string(),
            name: "p".to_string(),
            kind: ProviderKind::DeepSeek,
            enabled: true,
            base_url: "https://api.deepseek.com/v1".to_string(),
            account_name: None,
            api_key: Some("sk".to_string()),
            model_map: None,
            include_in_failover: true,
            health: ProviderHealth::default(),
        };
        assert_eq!(
            upstream_url(&provider, "/v1/models", Some("a=1")),
            "https://api.deepseek.com/v1/models?a=1"
        );
    }

    fn temp_home(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "codex-switcher-proxy-test-{}-{}",
            name,
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn save_proxy_config_accepts_valid_listen_address() {
        let home = temp_home("valid-config");
        save_proxy_config(
            &home,
            &ProxyConfig {
                host: "127.0.0.1".to_string(),
                port: 14551,
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let config = load_proxy_config(&home).unwrap();
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 14551);
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn save_proxy_config_rejects_invalid_listen_address_without_overwriting() {
        let home = temp_home("invalid-config");
        save_proxy_config(
            &home,
            &ProxyConfig {
                host: "127.0.0.1".to_string(),
                port: 14552,
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let error = save_proxy_config(
            &home,
            &ProxyConfig {
                host: "localhost".to_string(),
                port: 14553,
                ..ProxyConfig::default()
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("代理监听地址无效"));

        let config = load_proxy_config(&home).unwrap();
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 14552);

        let error = save_proxy_config(
            &home,
            &ProxyConfig {
                host: " 127.0.0.1".to_string(),
                ..ProxyConfig::default()
            },
        )
        .unwrap_err();
        assert!(error.to_string().contains("不能包含前后空格"));
        let _ = std::fs::remove_dir_all(home);
    }

    async fn start_mock_upstream(status: StatusCode) -> String {
        async fn handler(
            State(status): State<StatusCode>,
            Json(_body): Json<serde_json::Value>,
        ) -> impl IntoResponse {
            if status == StatusCode::OK {
                Json(serde_json::json!({
                    "choices": [
                        { "message": { "content": "ok" }, "finish_reason": "stop" }
                    ]
                }))
                .into_response()
            } else {
                (status, "quota exhausted").into_response()
            }
        }

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .route("/v1/chat/completions", post(handler))
            .with_state(status);
        tauri::async_runtime::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{}", addr)
    }

    async fn available_port() -> u16 {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        listener.local_addr().unwrap().port()
    }

    async fn start_mock_models_upstream(status: StatusCode) -> String {
        async fn models(State(status): State<StatusCode>) -> impl IntoResponse {
            if status == StatusCode::OK {
                Json(serde_json::json!({
                    "object": "list",
                    "data": [{ "id": "mock-model", "object": "model" }]
                }))
                .into_response()
            } else {
                (status, "health failed").into_response()
            }
        }

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let app = Router::new()
            .route("/v1/models", get(models))
            .with_state(status);
        tauri::async_runtime::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{}", addr)
    }

    #[tokio::test]
    async fn check_provider_health_updates_status() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("health-ok");
        let upstream = start_mock_models_upstream(StatusCode::OK).await;
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:health".to_string(),
                name: "Health".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: format!("{}/v1", upstream),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();

        let state = check_provider_health(home.clone(), "provider:health".to_string())
            .await
            .unwrap();
        let provider = state
            .providers
            .iter()
            .find(|provider| provider.id == "provider:health")
            .unwrap();
        assert_eq!(provider.health.status, ProviderHealthStatus::Healthy);
        assert!(provider.health.last_error.is_none());
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn check_provider_health_marks_auth_failure_invalid() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("health-invalid");
        let upstream = start_mock_models_upstream(StatusCode::UNAUTHORIZED).await;
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:invalid".to_string(),
                name: "Invalid".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: format!("{}/v1", upstream),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();

        let state = check_provider_health(home.clone(), "provider:invalid".to_string())
            .await
            .unwrap();
        let provider = state
            .providers
            .iter()
            .find(|provider| provider.id == "provider:invalid")
            .unwrap();
        assert_eq!(provider.health.status, ProviderHealthStatus::Invalid);
        assert!(provider
            .health
            .last_error
            .as_deref()
            .unwrap()
            .contains("401"));
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn check_provider_health_clears_current_route_when_provider_becomes_invalid() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("health-invalid-route");
        let upstream = start_mock_models_upstream(StatusCode::UNAUTHORIZED).await;
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:invalid-route".to_string(),
                name: "Invalid Route".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: format!("{}/v1", upstream),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();
        set_request_provider(&home, Some("provider:invalid-route".to_string())).unwrap();

        let state = check_provider_health(home.clone(), "provider:invalid-route".to_string())
            .await
            .unwrap();

        assert!(state.config.routing.request_provider_id.is_none());
        let provider = state
            .providers
            .iter()
            .find(|provider| provider.id == "provider:invalid-route")
            .unwrap();
        assert_eq!(provider.health.status, ProviderHealthStatus::Invalid);
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn check_all_provider_health_updates_configured_providers() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("health-all");
        let good = start_mock_models_upstream(StatusCode::OK).await;
        let bad = start_mock_models_upstream(StatusCode::UNAUTHORIZED).await;
        for (id, base_url) in [("provider:good", good), ("provider:bad", bad)] {
            providers::save_provider(
                &home,
                ProviderConfig {
                    id: id.to_string(),
                    name: id.to_string(),
                    kind: ProviderKind::OpenAiCompatible,
                    enabled: true,
                    base_url: format!("{}/v1", base_url),
                    account_name: None,
                    api_key: Some("sk-test".to_string()),
                    model_map: None,
                    include_in_failover: true,
                    health: ProviderHealth::default(),
                },
            )
            .unwrap();
        }

        let state = check_all_provider_health(home.clone()).await.unwrap();
        let good = state
            .providers
            .iter()
            .find(|provider| provider.id == "provider:good")
            .unwrap();
        let bad = state
            .providers
            .iter()
            .find(|provider| provider.id == "provider:bad")
            .unwrap();
        assert_eq!(good.health.status, ProviderHealthStatus::Healthy);
        assert_eq!(bad.health.status, ProviderHealthStatus::Invalid);
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn proxy_forwards_responses_to_chat_completions_provider() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("forward");
        let upstream = start_mock_upstream(StatusCode::OK).await;
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                routing: RoutingPolicy {
                    request_provider_id: Some("provider:test".to_string()),
                    allow_third_party_failover: true,
                    ..RoutingPolicy::default()
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:test".to_string(),
                name: "Mock".to_string(),
                kind: ProviderKind::CustomChatCompletions,
                enabled: true,
                base_url: format!("{}/v1", upstream),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth {
                    status: ProviderHealthStatus::Healthy,
                    ..ProviderHealth::default()
                },
            },
        )
        .unwrap();

        let state = start_proxy(home.clone()).await.unwrap();
        let response = reqwest::Client::new()
            .post(format!("{}/v1/responses", state.listen_url.unwrap()))
            .json(&serde_json::json!({ "model": "gpt-4.1", "input": "hello", "stream": false }))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let body: serde_json::Value = response.json().await.unwrap();
        assert_eq!(body["object"], "response");
        assert_eq!(body["output"][0]["content"][0]["text"], "ok");
        let requests = load_requests(&home);
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].provider.as_deref(), Some("Mock"));
        assert_eq!(requests[0].method, "POST");
        assert_eq!(requests[0].path, "/v1/responses");
        assert_eq!(requests[0].status_code, Some(200));
        assert!(requests[0].success);
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn proxy_returns_synthetic_models_without_configured_provider() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("models-no-provider");
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let state = start_proxy(home.clone()).await.unwrap();
        let response = reqwest::Client::new()
            .get(format!("{}/v1/models", state.listen_url.unwrap()))
            .send()
            .await
            .unwrap();

        assert_eq!(response.status(), reqwest::StatusCode::OK);
        let body: serde_json::Value = response.json().await.unwrap();
        assert_eq!(body["object"], "list");
        assert_eq!(body["data"][0]["id"], "gpt-4.1");
        assert_eq!(body["data"][0]["owned_by"], "Codex Switcher");
        let requests = load_requests(&home);
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].path, "/v1/models");
        assert_eq!(requests[0].status_code, Some(200));
        assert!(requests[0].success);
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn start_and_stop_proxy_manage_codex_config() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("lifecycle");
        std::fs::write(home.join("config.toml"), "model = \"gpt-4.1\"\n").unwrap();
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: false,
                port,
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let state = start_proxy(home.clone()).await.unwrap();
        assert!(state.config.enabled);
        assert!(state.config.install_codex_config);
        assert!(state.codex_config.installed);
        let expected = format!("http://127.0.0.1:{port}/backend-api");
        assert_eq!(
            state.codex_config.current_base_url.as_deref(),
            Some(expected.as_str())
        );

        let stopped = stop_proxy(&home).unwrap();
        assert!(!stopped.config.enabled);
        assert!(!stopped.config.install_codex_config);
        let restored = std::fs::read_to_string(home.join("config.toml")).unwrap();
        assert_eq!(restored, "model = \"gpt-4.1\"\n");
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn update_proxy_config_restarts_running_proxy_on_listen_address_change() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("restart-config-change");
        std::fs::write(home.join("config.toml"), "model = \"gpt-4.1\"\n").unwrap();
        let first_port = available_port().await;
        let second_port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port: first_port,
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let started = start_proxy(home.clone()).await.unwrap();
        assert_eq!(
            started.listen_url.as_deref(),
            Some(format!("http://127.0.0.1:{first_port}").as_str())
        );

        let updated = update_proxy_config(
            home.clone(),
            ProxyConfig {
                enabled: true,
                port: second_port,
                install_codex_config: true,
                ..started.config
            },
        )
        .await
        .unwrap();

        assert_eq!(
            updated.listen_url.as_deref(),
            Some(format!("http://127.0.0.1:{second_port}").as_str())
        );
        assert_eq!(updated.config.port, second_port);
        assert!(updated.codex_config.installed);
        assert_eq!(
            updated.codex_config.current_base_url.as_deref(),
            Some(format!("http://127.0.0.1:{second_port}/backend-api").as_str())
        );

        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn startup_restore_starts_proxy_and_restores_mobile_residency() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("startup-restore");
        let port = available_port().await;
        let account_dir = home.join("accounts").join("phone@example.com");
        std::fs::create_dir_all(&account_dir).unwrap();
        std::fs::write(
            account_dir.join("auth.json"),
            serde_json::json!({
                "tokens": {
                    "access_token": "access-token",
                    "refresh_token": "refresh-token"
                }
            })
            .to_string(),
        )
        .unwrap();
        std::fs::write(home.join("auth.json"), "{}").unwrap();
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                mobile_residency: MobileResidencyConfig {
                    enabled: true,
                    account_name: Some("phone@example.com".to_string()),
                    restore_on_startup: true,
                    notify_on_error: true,
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let state = restore_proxy_on_startup(home.clone()).await.unwrap();
        assert!(matches!(state.status, ProxyRuntimeStatus::Running));
        assert!(state.listen_url.is_some());
        let restored = std::fs::read_to_string(home.join("auth.json")).unwrap();
        assert!(restored.contains("access-token"));
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn proxy_failovers_after_quota_response() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("failover");
        let bad = start_mock_upstream(StatusCode::TOO_MANY_REQUESTS).await;
        let good = start_mock_upstream(StatusCode::OK).await;
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                routing: RoutingPolicy {
                    request_provider_id: Some("provider:bad".to_string()),
                    automatic_failover: true,
                    max_retries: 2,
                    allow_third_party_failover: true,
                    ..RoutingPolicy::default()
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();
        for (id, base_url) in [("provider:bad", bad), ("provider:good", good)] {
            providers::save_provider(
                &home,
                ProviderConfig {
                    id: id.to_string(),
                    name: id.to_string(),
                    kind: ProviderKind::CustomChatCompletions,
                    enabled: true,
                    base_url: format!("{}/v1", base_url),
                    account_name: None,
                    api_key: Some("sk-test".to_string()),
                    model_map: None,
                    include_in_failover: true,
                    health: ProviderHealth {
                        status: ProviderHealthStatus::Healthy,
                        ..ProviderHealth::default()
                    },
                },
            )
            .unwrap();
        }

        let state = start_proxy(home.clone()).await.unwrap();
        let response = reqwest::Client::new()
            .post(format!("{}/v1/responses", state.listen_url.unwrap()))
            .json(&serde_json::json!({ "model": "gpt-4.1", "input": "hello", "stream": false }))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::OK);
        assert!(response.text().await.unwrap().contains("ok"));
        let failovers = load_failovers(&home);
        assert!(!failovers.is_empty());
        assert_eq!(failovers[0].from_provider, "provider:bad");
        assert_eq!(failovers[0].to_provider.as_deref(), Some("provider:good"));
        assert_eq!(failovers[0].status_code, Some(429));
        assert_eq!(failovers[0].method.as_deref(), Some("POST"));
        assert_eq!(failovers[0].path.as_deref(), Some("/v1/responses"));
        assert_eq!(failovers[0].replay_safe, Some(true));
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn classifies_replay_safe_requests() {
        assert!(is_replay_safe_request(
            &Method::GET,
            "/backend-api/accounts/check"
        ));
        assert!(is_replay_safe_request(&Method::POST, "/v1/responses"));
        assert!(is_replay_safe_request(
            &Method::POST,
            "/v1/chat/completions"
        ));
        assert!(!is_replay_safe_request(
            &Method::POST,
            "/backend-api/conversation"
        ));
        assert!(!is_replay_safe_request(&Method::DELETE, "/v1/responses"));
    }

    #[tokio::test]
    async fn proxy_does_not_replay_unknown_post_paths() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("unknown-post-replay");
        let bad = start_mock_upstream(StatusCode::TOO_MANY_REQUESTS).await;
        let good = start_mock_upstream(StatusCode::OK).await;
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                routing: RoutingPolicy {
                    request_provider_id: Some("provider:bad".to_string()),
                    automatic_failover: true,
                    max_retries: 2,
                    allow_third_party_failover: true,
                    ..RoutingPolicy::default()
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();
        for (id, base_url) in [("provider:bad", bad), ("provider:good", good)] {
            providers::save_provider(
                &home,
                ProviderConfig {
                    id: id.to_string(),
                    name: id.to_string(),
                    kind: ProviderKind::CustomChatCompletions,
                    enabled: true,
                    base_url: format!("{}/v1", base_url),
                    account_name: None,
                    api_key: Some("sk-test".to_string()),
                    model_map: None,
                    include_in_failover: true,
                    health: ProviderHealth {
                        status: ProviderHealthStatus::Healthy,
                        ..ProviderHealth::default()
                    },
                },
            )
            .unwrap();
        }

        let state = start_proxy(home.clone()).await.unwrap();
        let response = reqwest::Client::new()
            .post(format!(
                "{}/backend-api/conversation",
                state.listen_url.unwrap()
            ))
            .json(&serde_json::json!({ "message": "unknown side-effect path" }))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::BAD_GATEWAY);
        assert!(load_failovers(&home).is_empty());
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn proxy_does_not_record_failover_when_disabled() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("no-failover");
        let bad = start_mock_upstream(StatusCode::TOO_MANY_REQUESTS).await;
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                routing: RoutingPolicy {
                    request_provider_id: Some("provider:bad".to_string()),
                    automatic_failover: false,
                    max_retries: 2,
                    allow_third_party_failover: true,
                    ..RoutingPolicy::default()
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:bad".to_string(),
                name: "provider:bad".to_string(),
                kind: ProviderKind::CustomChatCompletions,
                enabled: true,
                base_url: format!("{}/v1", bad),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth {
                    status: ProviderHealthStatus::Healthy,
                    ..ProviderHealth::default()
                },
            },
        )
        .unwrap();

        let state = start_proxy(home.clone()).await.unwrap();
        let response = reqwest::Client::new()
            .post(format!("{}/v1/responses", state.listen_url.unwrap()))
            .json(&serde_json::json!({ "model": "gpt-4.1", "input": "hello", "stream": false }))
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::BAD_GATEWAY);
        assert!(load_failovers(&home).is_empty());
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn removing_request_provider_clears_route() {
        let home = temp_home("remove-provider");
        save_proxy_config(
            &home,
            &ProxyConfig {
                routing: RoutingPolicy {
                    request_provider_id: Some("provider:delete".to_string()),
                    ..RoutingPolicy::default()
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:delete".to_string(),
                name: "Delete".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: "https://relay.example/v1".to_string(),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();

        remove_provider(&home, "provider:delete").unwrap();
        assert!(load_proxy_config(&home)
            .unwrap()
            .routing
            .request_provider_id
            .is_none());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn setting_unknown_request_provider_is_rejected() {
        let home = temp_home("unknown-request-provider");
        let error = set_request_provider(&home, Some("account:missing@example.com".to_string()))
            .unwrap_err();
        assert!(error.to_string().contains("请求出口不存在"));
        assert!(load_proxy_config(&home)
            .unwrap()
            .routing
            .request_provider_id
            .is_none());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn get_proxy_state_clears_stale_request_provider() {
        let home = temp_home("stale-request-provider");
        save_proxy_config(
            &home,
            &ProxyConfig {
                routing: RoutingPolicy {
                    request_provider_id: Some("provider:missing".to_string()),
                    ..RoutingPolicy::default()
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let state = get_proxy_state(&home).unwrap();

        assert!(state.config.routing.request_provider_id.is_none());
        assert!(state
            .warnings
            .iter()
            .any(|warning| warning.contains("已恢复默认路由")));
        assert!(load_proxy_config(&home)
            .unwrap()
            .routing
            .request_provider_id
            .is_none());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn disabling_current_request_provider_clears_route() {
        let home = temp_home("disable-current-provider");
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:disable".to_string(),
                name: "Disable".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: "https://relay.example/v1".to_string(),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();
        set_request_provider(&home, Some("provider:disable".to_string())).unwrap();

        update_provider_options(&home, "provider:disable", Some(false), None).unwrap();

        assert!(load_proxy_config(&home)
            .unwrap()
            .routing
            .request_provider_id
            .is_none());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn saving_disabled_current_provider_clears_route() {
        let home = temp_home("save-disabled-provider");
        save_provider(
            &home,
            ProviderConfig {
                id: "provider:save-disabled".to_string(),
                name: "Save Disabled".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: "https://relay.example/v1".to_string(),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();
        set_request_provider(&home, Some("provider:save-disabled".to_string())).unwrap();

        save_provider(
            &home,
            ProviderConfig {
                id: "provider:save-disabled".to_string(),
                name: "Save Disabled".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: false,
                base_url: "https://relay.example/v1".to_string(),
                account_name: None,
                api_key: None,
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();

        assert!(load_proxy_config(&home)
            .unwrap()
            .routing
            .request_provider_id
            .is_none());
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn setting_manual_request_provider_does_not_require_failover_membership() {
        let home = temp_home("manual-provider-outside-failover");
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:manual".to_string(),
                name: "Manual".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: "https://relay.example/v1".to_string(),
                account_name: None,
                api_key: Some("sk-test".to_string()),
                model_map: None,
                include_in_failover: false,
                health: ProviderHealth::default(),
            },
        )
        .unwrap();

        set_request_provider(&home, Some("provider:manual".to_string())).unwrap();

        assert_eq!(
            load_proxy_config(&home)
                .unwrap()
                .routing
                .request_provider_id
                .as_deref(),
            Some("provider:manual")
        );
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn clear_proxy_events_removes_request_and_failover_logs() {
        let home = temp_home("clear-events");
        append_failover(
            &home,
            FailoverEvent {
                id: "f1".to_string(),
                time: Utc::now().to_rfc3339(),
                from_provider: "a".to_string(),
                to_provider: Some("b".to_string()),
                reason: "rate limit".to_string(),
                status_code: Some(429),
                method: Some("POST".to_string()),
                path: Some("/v1/responses".to_string()),
                replay_safe: Some(true),
            },
        );
        append_request(
            &home,
            ProxyRequestEvent {
                id: "r1".to_string(),
                time: Utc::now().to_rfc3339(),
                provider: Some("a".to_string()),
                method: "POST".to_string(),
                path: "/v1/responses".to_string(),
                status_code: Some(200),
                success: true,
                attempts: 1,
                duration_ms: 1,
                replay_safe: true,
                error: None,
            },
        );

        let state = clear_proxy_events(&home).unwrap();

        assert!(state.recent_failovers.is_empty());
        assert!(state.recent_requests.is_empty());
        assert!(load_failovers(&home).is_empty());
        assert!(load_requests(&home).is_empty());
        let _ = std::fs::remove_dir_all(home);
    }

    async fn start_mock_ws_upstream() -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        async fn ws_echo(ws: WebSocketUpgrade) -> impl IntoResponse {
            ws.on_upgrade(|mut socket| async move {
                while let Some(message) = socket.next().await {
                    let Ok(message) = message else {
                        break;
                    };
                    if matches!(message, AxumWsMessage::Text(_) | AxumWsMessage::Binary(_)) {
                        let _ = socket.send(message).await;
                    }
                }
            })
        }
        let app = Router::new().route("/v1/realtime", route_any(ws_echo));
        tauri::async_runtime::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{}", addr)
    }

    #[tokio::test]
    async fn proxy_bridges_websocket_messages() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("ws");
        let upstream = start_mock_ws_upstream().await;
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                routing: RoutingPolicy {
                    request_provider_id: Some("provider:ws".to_string()),
                    allow_third_party_failover: true,
                    ..RoutingPolicy::default()
                },
                ..ProxyConfig::default()
            },
        )
        .unwrap();
        providers::save_provider(
            &home,
            ProviderConfig {
                id: "provider:ws".to_string(),
                name: "WS".to_string(),
                kind: ProviderKind::OpenAiCompatible,
                enabled: true,
                base_url: format!("{}/v1", upstream),
                account_name: None,
                api_key: None,
                model_map: None,
                include_in_failover: true,
                health: ProviderHealth {
                    status: ProviderHealthStatus::Healthy,
                    ..ProviderHealth::default()
                },
            },
        )
        .unwrap();

        let direct_url = upstream.replace("http://", "ws://") + "/v1/realtime";
        let (mut direct_socket, _) = connect_async(direct_url).await.unwrap();
        direct_socket
            .send(TungsteniteMessage::Text("direct".to_string()))
            .await
            .unwrap();
        let direct_response = direct_socket.next().await.unwrap().unwrap();
        assert_eq!(direct_response.into_text().unwrap(), "direct");
        direct_socket.close(None).await.unwrap();

        let state = start_proxy(home.clone()).await.unwrap();
        let ws_url = state.listen_url.unwrap().replace("http://", "ws://") + "/v1/realtime";
        let (mut socket, _) = connect_async(ws_url).await.unwrap();
        socket
            .send(TungsteniteMessage::Text("ping".to_string()))
            .await
            .unwrap();
        let response = socket.next().await.unwrap().unwrap();
        assert_eq!(response.into_text().unwrap(), "ping");
        socket.close(None).await.unwrap();
        let requests = load_requests(&home);
        assert!(!requests.is_empty());
        assert_eq!(requests[0].provider.as_deref(), Some("WS"));
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].path, "/v1/realtime");
        assert_eq!(requests[0].status_code, Some(101));
        assert!(requests[0].success);
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }

    #[tokio::test]
    async fn proxy_records_websocket_failure_without_provider() {
        let _guard = TEST_PROXY_MUTEX.lock().await;
        let home = temp_home("ws-no-provider");
        let port = available_port().await;
        save_proxy_config(
            &home,
            &ProxyConfig {
                enabled: true,
                port,
                ..ProxyConfig::default()
            },
        )
        .unwrap();

        let state = start_proxy(home.clone()).await.unwrap();
        let ws_url = state.listen_url.unwrap().replace("http://", "ws://") + "/v1/realtime";
        if let Ok((mut socket, _)) = connect_async(ws_url).await {
            let _ = socket.next().await;
            let _ = socket.close(None).await;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;

        let requests = load_requests(&home);
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].provider, None);
        assert_eq!(requests[0].method, "GET");
        assert_eq!(requests[0].path, "/v1/realtime");
        assert_eq!(requests[0].status_code, None);
        assert!(!requests[0].success);
        assert_eq!(requests[0].attempts, 0);
        assert!(requests[0]
            .error
            .as_deref()
            .unwrap()
            .contains("没有可用 WebSocket 请求出口"));
        stop_proxy(&home).unwrap();
        let _ = std::fs::remove_dir_all(home);
    }
}
