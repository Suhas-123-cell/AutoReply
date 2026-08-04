//! Consolidated env config, ported from `lib/env.ts`. Node's version splits
//! validation across a Zod schema (9 vars) and several ad-hoc `process.env`
//! reads elsewhere (email, Firebase, cron/OTP secrets, polling tuning) — this
//! struct validates the full real surface (~20 vars) up front at process
//! start, rather than failing lazily on first use.

use std::env;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("{0} environment variable is required")]
    Missing(&'static str),
    #[error("ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)")]
    BadEncryptionKey,
    #[error("NEXTAUTH_SECRET must be at least 16 characters")]
    ShortNextauthSecret,
    #[error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON: {0}")]
    BadFirebaseJson(String),
    #[error("FIREBASE_SERVICE_ACCOUNT_JSON must include project_id, client_email, and private_key")]
    IncompleteFirebaseJson,
}

#[derive(Debug, Clone)]
pub struct FirebaseServiceAccount {
    pub project_id: String,
    pub client_email: String,
    pub private_key: String,
}

#[derive(Debug, Clone)]
pub struct Config {
    // Auth / session
    pub nextauth_url: String,
    pub nextauth_secret: String,
    pub cron_secret: Option<String>,
    pub mobile_otp_secret: Option<String>,
    pub mobile_otp_dev_echo: bool,
    pub mobile_api_enabled: bool,

    // Database / queue
    pub database_url: String,
    pub redis_url: String,

    // Meta / Instagram
    pub instagram_app_id: String,
    pub instagram_app_secret: String,
    pub facebook_app_secret: String,
    pub webhook_verify_token: String,
    pub meta_graph_api_version: String,

    // Email
    pub resend_api_key: Option<String>,
    pub email_from: Option<String>,

    // Push / Firebase
    pub firebase_service_account: Option<FirebaseServiceAccount>,

    // Encryption
    pub encryption_key_hex: String,

    // Worker-only polling tuning (defaults match lib/polling/comment-reconciler.ts)
    pub comment_poll_interval_ms: u64,
    pub comment_poll_lookback_hours: u64,
    pub comment_poll_max_per_sweep: u32,
}

fn read_required(name: &'static str) -> Result<String, ConfigError> {
    env::var(name).map_err(|_| ConfigError::Missing(name))
}

fn read_optional(name: &str) -> Option<String> {
    env::var(name).ok().filter(|v| !v.is_empty())
}

fn is_hex_32_byte(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

impl Config {
    /// Loads and validates every required var from the process environment.
    /// Mirrors `validateCoreEnv()` in `lib/env.ts`, but covers the full real
    /// surface rather than just the 9 vars in the Node Zod schema.
    pub fn from_env() -> Result<Self, ConfigError> {
        let nextauth_secret = read_required("NEXTAUTH_SECRET")?;
        if nextauth_secret.len() < 16 {
            return Err(ConfigError::ShortNextauthSecret);
        }

        let encryption_key_hex = read_required("ENCRYPTION_KEY")?;
        if !is_hex_32_byte(&encryption_key_hex) {
            return Err(ConfigError::BadEncryptionKey);
        }

        let firebase_service_account = match read_optional("FIREBASE_SERVICE_ACCOUNT_JSON") {
            Some(raw) => Some(parse_firebase_service_account(&raw)?),
            None => None,
        };

        Ok(Config {
            nextauth_url: env::var("NEXTAUTH_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            nextauth_secret,
            cron_secret: read_optional("CRON_SECRET"),
            mobile_otp_secret: read_optional("MOBILE_OTP_SECRET"),
            mobile_otp_dev_echo: read_optional("MOBILE_OTP_DEV_ECHO").as_deref() == Some("true"),
            mobile_api_enabled: read_optional("MOBILE_API_ENABLED").as_deref() != Some("false"),

            database_url: read_required("DATABASE_URL")?,
            redis_url: read_required("REDIS_URL")?,

            instagram_app_id: read_required("INSTAGRAM_APP_ID")?,
            instagram_app_secret: read_required("INSTAGRAM_APP_SECRET")?,
            facebook_app_secret: read_required("FACEBOOK_APP_SECRET")?,
            webhook_verify_token: read_required("WEBHOOK_VERIFY_TOKEN")?,
            meta_graph_api_version: env::var("META_GRAPH_API_VERSION")
                .unwrap_or_else(|_| "v25.0".to_string()),

            resend_api_key: read_optional("RESEND_API_KEY"),
            email_from: read_optional("EMAIL_FROM"),

            firebase_service_account,

            encryption_key_hex,

            comment_poll_interval_ms: read_optional("COMMENT_POLL_INTERVAL_MS")
                .and_then(|v| v.parse().ok())
                .unwrap_or(5 * 60 * 1000),
            comment_poll_lookback_hours: read_optional("COMMENT_POLL_LOOKBACK_HOURS")
                .and_then(|v| v.parse().ok())
                .unwrap_or(72),
            comment_poll_max_per_sweep: read_optional("COMMENT_POLL_MAX_PER_SWEEP")
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
        })
    }

    /// Vars that must be present before an Instagram OAuth round trip starts.
    /// Mirrors `getMissingInstagramOAuthEnv()` — returns names of anything
    /// missing or malformed, so a self-hoster gets the variable names back
    /// instead of failing mid-flow.
    pub fn missing_instagram_oauth_env(&self) -> Vec<&'static str> {
        let mut missing = Vec::new();
        if self.instagram_app_id.is_empty() {
            missing.push("INSTAGRAM_APP_ID");
        }
        if self.instagram_app_secret.is_empty() {
            missing.push("INSTAGRAM_APP_SECRET");
        }
        if !is_hex_32_byte(&self.encryption_key_hex) {
            missing.push("ENCRYPTION_KEY");
        }
        if self.nextauth_secret.is_empty() {
            missing.push("NEXTAUTH_SECRET");
        }
        missing
    }
}

fn parse_firebase_service_account(raw: &str) -> Result<FirebaseServiceAccount, ConfigError> {
    let parsed: serde_json::Value =
        serde_json::from_str(raw).map_err(|e| ConfigError::BadFirebaseJson(e.to_string()))?;

    let project_id = parsed.get("project_id").and_then(|v| v.as_str());
    let client_email = parsed.get("client_email").and_then(|v| v.as_str());
    let private_key = parsed.get("private_key").and_then(|v| v.as_str());

    match (project_id, client_email, private_key) {
        (Some(project_id), Some(client_email), Some(private_key)) => {
            Ok(FirebaseServiceAccount {
                project_id: project_id.to_string(),
                client_email: client_email.to_string(),
                // The console's JSON escapes newlines as literal "\n"; the
                // JWT signer needs real line breaks to parse the PEM key.
                private_key: private_key.replace("\\n", "\n"),
            })
        }
        _ => Err(ConfigError::IncompleteFirebaseJson),
    }
}
