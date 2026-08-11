//! Error taxonomy for the Instagram/Facebook Graph API, ported from
//! `lib/meta/client.ts`'s `MetaApiError`/`TokenExpiredError`/`RateLimitError`/
//! `PermissionError` class hierarchy. An enum replaces the class hierarchy —
//! callers (the worker's DM pipeline) match on the variant instead of
//! `instanceof`.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MetaApiError {
    /// Graph API error code 190: the access token is expired or invalid.
    #[error("Instagram access token expired or invalid: {message}")]
    TokenExpired {
        message: String,
        fb_trace_id: Option<String>,
    },
    /// Graph API error codes 368, 4, 17: rate limited.
    #[error("Meta API rate limit: {message}")]
    RateLimit {
        message: String,
        fb_trace_id: Option<String>,
    },
    /// Graph API error codes 10, 100, 200: missing permission/scope.
    #[error("Meta API permission error: {message}")]
    Permission {
        message: String,
        fb_trace_id: Option<String>,
    },
    /// Any other Graph API error envelope.
    #[error("Meta API error {code}: {message}")]
    Other {
        code: i64,
        subcode: Option<i64>,
        fb_trace_id: Option<String>,
        message: String,
    },
    #[error("HTTP request to Meta API failed: {0}")]
    Request(#[from] reqwest::Error),
}

/// Pure classification, split out from response-body reading so it's unit
/// testable without a live HTTP round trip. Mirrors `handleResponse`'s
/// `if (!response.ok || data.error)` branch and code-to-class `switch`.
pub(crate) fn classify_error(
    status_is_success: bool,
    status_code: u16,
    value: &serde_json::Value,
) -> Option<MetaApiError> {
    let error = value.get("error");
    if status_is_success && error.is_none() {
        return None;
    }

    let code = error
        .and_then(|e| e.get("code"))
        .and_then(|v| v.as_i64())
        .unwrap_or(status_code as i64);
    let subcode = error
        .and_then(|e| e.get("error_subcode"))
        .and_then(|v| v.as_i64());
    let fb_trace_id = error
        .and_then(|e| e.get("fbtrace_id"))
        .and_then(|v| v.as_str())
        .map(String::from);
    let message = error
        .and_then(|e| e.get("message"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown Meta API error")
        .to_string();

    Some(match code {
        190 => MetaApiError::TokenExpired { message, fb_trace_id },
        368 | 4 | 17 => MetaApiError::RateLimit { message, fb_trace_id },
        10 | 100 | 200 => MetaApiError::Permission { message, fb_trace_id },
        _ => MetaApiError::Other {
            code,
            subcode,
            fb_trace_id,
            message,
        },
    })
}

/// Reads and JSON-decodes a Graph API response, raising the appropriate
/// `MetaApiError` variant on an error envelope, otherwise deserializing the
/// body as `T`. Mirrors `handleResponse<T>`.
pub(crate) async fn handle_response<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, MetaApiError> {
    let status = response.status();
    let bytes = response.bytes().await?;
    let value: serde_json::Value =
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);

    if let Some(err) = classify_error(status.is_success(), status.as_u16(), &value) {
        return Err(err);
    }

    serde_json::from_value(value).map_err(|e| MetaApiError::Other {
        code: status.as_u16() as i64,
        subcode: None,
        fb_trace_id: None,
        message: format!("failed to parse Meta API response: {e}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn error_envelope(code: i64) -> serde_json::Value {
        json!({
            "error": {
                "message": "boom",
                "type": "OAuthException",
                "code": code,
                "fbtrace_id": "trace-1"
            }
        })
    }

    #[test]
    fn maps_190_to_token_expired() {
        let err = classify_error(false, 400, &error_envelope(190)).unwrap();
        assert!(matches!(err, MetaApiError::TokenExpired { .. }));
    }

    #[test]
    fn maps_368_4_and_17_to_rate_limit() {
        for code in [368, 4, 17] {
            let err = classify_error(false, 400, &error_envelope(code)).unwrap();
            assert!(matches!(err, MetaApiError::RateLimit { .. }), "code {code}");
        }
    }

    #[test]
    fn maps_10_100_and_200_to_permission() {
        for code in [10, 100, 200] {
            let err = classify_error(false, 400, &error_envelope(code)).unwrap();
            assert!(matches!(err, MetaApiError::Permission { .. }), "code {code}");
        }
    }

    #[test]
    fn maps_unknown_code_to_other() {
        let err = classify_error(false, 400, &error_envelope(1)).unwrap();
        match err {
            MetaApiError::Other { code, .. } => assert_eq!(code, 1),
            other => panic!("expected Other, got {other:?}"),
        }
    }

    #[test]
    fn success_with_no_error_field_classifies_as_none() {
        assert!(classify_error(true, 200, &json!({ "id": "123" })).is_none());
    }

    #[test]
    fn non_ok_status_without_error_field_falls_back_to_status_code() {
        let err = classify_error(false, 500, &json!({})).unwrap();
        match err {
            MetaApiError::Other { code, message, .. } => {
                assert_eq!(code, 500);
                assert_eq!(message, "Unknown Meta API error");
            }
            other => panic!("expected Other, got {other:?}"),
        }
    }
}
