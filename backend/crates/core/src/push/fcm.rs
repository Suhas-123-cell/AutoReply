//! Firebase Cloud Messaging client, ported from `lib/firebase/admin.ts` +
//! `lib/push/fcm.ts` (as of the `remove-expo-bare-rn` branch — this is the
//! target push backend once that branch merges, not the Expo path still on
//! `main`).
//!
//! There's no official Rust Firebase Admin SDK, so this talks to FCM
//! directly: a service-account JWT is exchanged for a short-lived OAuth2
//! access token (Google's standard `jwt-bearer` grant), then each push is
//! sent as an individual call to FCM's HTTP v1 `messages:send` endpoint.
//! FCM is the single delivery path for both platforms — Android registers a
//! native FCM token, and iOS registers an APNs token that Firebase re-wraps
//! into an FCM registration token once the project's APNs key is configured
//! in the Firebase console.

use std::collections::HashMap;

use serde::Serialize;
use thiserror::Error;
use tokio::sync::Mutex;

const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const FCM_SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";
// FCM's per-request message cap. Not a true batch HTTP call — each message
// in a chunk is still sent as its own request to messages:send; this only
// bounds how many are in flight together.
const MAX_MESSAGES_PER_REQUEST: usize = 500;
// Refresh this many seconds before the token's actual expiry, so an
// in-flight send never races a token that expires mid-request.
const TOKEN_REFRESH_SKEW_SECS: i64 = 60;

#[derive(Debug, Error)]
pub enum FcmError {
    #[error("FCM service-account auth failed: {0}")]
    Auth(String),
    #[error("HTTP request to FCM failed: {0}")]
    Request(#[from] reqwest::Error),
}

pub struct FcmPushMessage {
    pub to: String,
    pub title: String,
    pub body: String,
    pub data: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FcmTicketStatus {
    Ok,
    Error,
}

#[derive(Debug, Clone)]
pub struct FcmPushTicket {
    pub to: String,
    pub status: FcmTicketStatus,
    pub id: Option<String>,
    pub message: Option<String>,
    /// FCM's machine-readable error code, e.g. `"UNREGISTERED"` — the raw
    /// HTTP v1 API's error taxonomy, distinct from the Node Admin SDK's
    /// string codes like `"messaging/registration-token-not-registered"`.
    /// This is the signal the caller uses to disable a device.
    pub error_code: Option<String>,
}

struct CachedToken {
    access_token: String,
    expires_at: i64,
}

pub struct FcmClient {
    http: reqwest::Client,
    project_id: String,
    client_email: String,
    private_key: String,
    token_cache: Mutex<Option<CachedToken>>,
}

impl FcmClient {
    pub fn new(
        project_id: impl Into<String>,
        client_email: impl Into<String>,
        private_key: impl Into<String>,
    ) -> Self {
        Self {
            http: reqwest::Client::new(),
            project_id: project_id.into(),
            client_email: client_email.into(),
            private_key: private_key.into(),
            token_cache: Mutex::new(None),
        }
    }

    pub fn from_service_account(account: &crate::config::FirebaseServiceAccount) -> Self {
        Self::new(
            account.project_id.clone(),
            account.client_email.clone(),
            account.private_key.clone(),
        )
    }

    /// Send a batch of push messages via FCM, returning one ticket per
    /// message (in the same order as the input) so the caller can detect
    /// per-device failures such as an unregistered token. Mirrors
    /// `sendFcmPushNotifications`.
    pub async fn send_push_notifications(
        &self,
        messages: &[FcmPushMessage],
    ) -> Result<Vec<FcmPushTicket>, FcmError> {
        let access_token = self.access_token().await?;
        let mut tickets = Vec::with_capacity(messages.len());

        for chunk in messages.chunks(MAX_MESSAGES_PER_REQUEST) {
            let sends = chunk.iter().map(|msg| self.send_one(&access_token, msg));
            tickets.extend(futures_util::future::join_all(sends).await);
        }

        Ok(tickets)
    }

    async fn send_one(&self, access_token: &str, msg: &FcmPushMessage) -> FcmPushTicket {
        let url = format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            self.project_id
        );
        let body = serde_json::json!({
            "message": {
                "token": msg.to,
                "notification": { "title": msg.title, "body": msg.body },
                "data": msg.data,
            }
        });

        let response = match self.http.post(url).bearer_auth(access_token).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                return FcmPushTicket {
                    to: msg.to.clone(),
                    status: FcmTicketStatus::Error,
                    id: None,
                    message: Some(e.to_string()),
                    error_code: None,
                }
            }
        };

        let status_is_success = response.status().is_success();
        let value: serde_json::Value = response.json().await.unwrap_or(serde_json::Value::Null);

        if status_is_success {
            let id = value.get("name").and_then(|v| v.as_str()).map(String::from);
            return FcmPushTicket {
                to: msg.to.clone(),
                status: FcmTicketStatus::Ok,
                id,
                message: None,
                error_code: None,
            };
        }

        let error = value.get("error");
        let message = error
            .and_then(|e| e.get("message"))
            .and_then(|v| v.as_str())
            .map(String::from);
        // The FCM-specific error code lives in error.details[], the entry
        // whose @type is FcmError; fall back to the coarser gRPC-style
        // `status` field (e.g. "NOT_FOUND") if that's absent.
        let error_code = error
            .and_then(|e| e.get("details"))
            .and_then(|d| d.as_array())
            .and_then(|details| {
                details
                    .iter()
                    .find_map(|d| d.get("errorCode").and_then(|v| v.as_str()))
            })
            .map(String::from)
            .or_else(|| {
                error
                    .and_then(|e| e.get("status"))
                    .and_then(|v| v.as_str())
                    .map(String::from)
            });

        FcmPushTicket {
            to: msg.to.clone(),
            status: FcmTicketStatus::Error,
            id: None,
            message,
            error_code,
        }
    }

    async fn access_token(&self) -> Result<String, FcmError> {
        {
            let cache = self.token_cache.lock().await;
            if let Some(cached) = cache.as_ref() {
                if cached.expires_at - TOKEN_REFRESH_SKEW_SECS > chrono::Utc::now().timestamp() {
                    return Ok(cached.access_token.clone());
                }
            }
        }

        let fresh = self.fetch_access_token().await?;
        let token = fresh.access_token.clone();
        let mut cache = self.token_cache.lock().await;
        *cache = Some(fresh);
        Ok(token)
    }

    async fn fetch_access_token(&self) -> Result<CachedToken, FcmError> {
        let assertion = build_assertion(&self.client_email, &self.private_key)?;
        let params = [
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", assertion.as_str()),
        ];

        let response = self.http.post(TOKEN_ENDPOINT).form(&params).send().await?;
        let status_is_success = response.status().is_success();
        let body: serde_json::Value = response.json().await?;

        if !status_is_success {
            let msg = body
                .get("error_description")
                .and_then(|v| v.as_str())
                .unwrap_or("token exchange failed");
            return Err(FcmError::Auth(msg.to_string()));
        }

        let access_token = body
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| FcmError::Auth("token response missing access_token".to_string()))?
            .to_string();
        let expires_in = body.get("expires_in").and_then(|v| v.as_i64()).unwrap_or(3600);

        Ok(CachedToken {
            access_token,
            expires_at: chrono::Utc::now().timestamp() + expires_in,
        })
    }
}

#[derive(Serialize)]
struct ServiceAccountClaims {
    iss: String,
    scope: String,
    aud: String,
    iat: i64,
    exp: i64,
}

fn build_assertion(client_email: &str, private_key_pem: &str) -> Result<String, FcmError> {
    let now = chrono::Utc::now().timestamp();
    let claims = ServiceAccountClaims {
        iss: client_email.to_string(),
        scope: FCM_SCOPE.to_string(),
        aud: TOKEN_ENDPOINT.to_string(),
        iat: now,
        exp: now + 3600,
    };

    let key = jsonwebtoken::EncodingKey::from_rsa_pem(private_key_pem.as_bytes())
        .map_err(|e| FcmError::Auth(format!("invalid service account private key: {e}")))?;

    jsonwebtoken::encode(&jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256), &claims, &key)
        .map_err(|e| FcmError::Auth(format!("failed to sign service account JWT: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_assertion_rejects_malformed_key() {
        let err = build_assertion("sa@example.iam.gserviceaccount.com", "not a pem key").unwrap_err();
        assert!(matches!(err, FcmError::Auth(_)));
    }
}
