//! DB row structs, ported 1:1 from `prisma/schema.prisma` (19 models).
//! Field order and names follow the schema; relations are omitted (sqlx has
//! no relation loading — joins are explicit queries, not struct fields).
//! IDs are `String` (Prisma's `cuid()`, not UUID — id *generation* for new
//! rows uses the `cuid2` crate at the call site, not here).

use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value as Json;
use sqlx::FromRow;

use super::enums::{
    DmStatus, OperationalEventLevel, OperationalEventSource, WebhookStatus, WorkspaceInvitationStatus,
    WorkspaceRole,
};

#[derive(Debug, Clone, FromRow)]
pub struct User {
    pub id: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub email_verified: Option<DateTime<Utc>>,
    pub image: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Auth.js-owned OAuth account link. Column names are snake_case in the DB
/// (Prisma emitted them as-is, no @map) — this struct's field names match.
#[derive(Debug, Clone, FromRow)]
pub struct Account {
    pub id: String,
    pub user_id: String,
    #[sqlx(rename = "type")]
    pub account_type: String,
    pub provider: String,
    pub provider_account_id: String,
    pub refresh_token: Option<String>,
    pub access_token: Option<String>,
    pub expires_at: Option<i32>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub id_token: Option<String>,
    pub session_state: Option<String>,
}

/// Auth.js DB session AND the mobile bearer-token session (same table, see
/// `lib/auth/mobile-session.ts`) — `session_token` is the cookie value for
/// web, the bearer token for mobile.
#[derive(Debug, Clone, FromRow)]
pub struct Session {
    pub id: String,
    pub session_token: String,
    pub user_id: String,
    pub expires: DateTime<Utc>,
}

/// No primary key in the Postgres schema (Prisma allows a PK-less model) —
/// only the composite unique. sqlx's FromRow doesn't require a PK, so this
/// ports directly.
#[derive(Debug, Clone, FromRow)]
pub struct VerificationToken {
    pub identifier: String,
    pub token: String,
    pub expires: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub owner_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub usage_period_start: DateTime<Utc>,
    pub dms_sent_this_period: i32,
}

#[derive(Debug, Clone, FromRow)]
pub struct WorkspaceMember {
    pub id: String,
    pub workspace_id: String,
    pub user_id: String,
    pub role: WorkspaceRole,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct WorkspaceInvitation {
    pub id: String,
    pub workspace_id: String,
    pub email: String,
    pub role: WorkspaceRole,
    pub token: String,
    pub status: WorkspaceInvitationStatus,
    pub invited_by_user_id: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub accepted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// `access_token` is the AES-256-GCM ciphertext (base64) from
/// `crate::encryption` — never store or log the decrypted value.
/// `instagram_id` is the professional account's `user_id`, the join key for
/// incoming webhook `entry.id`.
#[derive(Debug, Clone, FromRow)]
pub struct InstagramAccount {
    pub id: String,
    pub workspace_id: String,
    pub instagram_id: String,
    pub username: String,
    pub name: Option<String>,
    pub access_token: String,
    pub token_expires_at: Option<DateTime<Utc>>,
    pub webhook_subscribed: bool,
    pub connected_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// `date` is a native Postgres `DATE` (no time component) — `NaiveDate`, not
/// `DateTime<Utc>`.
#[derive(Debug, Clone, FromRow)]
pub struct FollowerSnapshot {
    pub id: String,
    pub instagram_account_id: String,
    pub date: NaiveDate,
    pub followers_count: i32,
    pub backfilled: bool,
    pub created_at: DateTime<Utc>,
}

/// The widest model — 25+ scalar fields. `keywords`/`public_reply_messages`
/// are native Postgres `text[]` columns (`Vec<String>`, sqlx supports this
/// directly for Postgres arrays).
#[derive(Debug, Clone, FromRow)]
pub struct Automation {
    pub id: String,
    pub workspace_id: String,
    pub instagram_account_id: String,
    pub name: String,
    pub goal: Option<String>,
    pub post_id: Option<String>,
    pub post_url: Option<String>,
    pub pending_next_reel: bool,
    pub match_any_post: bool,
    pub keywords: Vec<String>,
    pub match_any_word: bool,
    pub dm_message: String,
    pub opening_dm_enabled: bool,
    pub opening_dm_message: Option<String>,
    pub opening_dm_button_label: Option<String>,
    pub link_button_label: Option<String>,
    pub require_follow: bool,
    pub follow_prompt_message: Option<String>,
    pub follow_prompt_button_label: Option<String>,
    pub follow_up_enabled: bool,
    pub follow_up_message: Option<String>,
    pub public_reply_enabled: bool,
    pub public_reply_message: Option<String>,
    pub public_reply_messages: Vec<String>,
    pub is_active: bool,
    pub whole_word_match: bool,
    pub report_share_slug: Option<String>,
    pub report_share_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// The idempotency anchor for the whole DM pipeline: `(automation_id,
/// comment_id)` is unique. Also overloaded to store non-comment events (see
/// `lib/queue/dm-worker.ts` postback handling) using a synthetic
/// `comment_id` like `"reveal:<userId>"`.
#[derive(Debug, Clone, FromRow)]
pub struct DmLog {
    pub id: String,
    pub workspace_id: String,
    pub automation_id: String,
    pub instagram_account_id: String,
    pub commenter_id: String,
    pub commenter_name: Option<String>,
    pub comment_text: String,
    pub comment_id: String,
    pub matched_keyword: Option<String>,
    pub status: DmStatus,
    pub attempts: i32,
    pub dm_sent_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub public_reply_sent_at: Option<DateTime<Utc>>,
    pub public_reply_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Dead in the current Node codebase (zero call sites found during
/// exploration) — ported for schema completeness, not expected to gain
/// real usage; consider dropping in a later cleanup.
#[derive(Debug, Clone, FromRow)]
pub struct ProcessedComment {
    pub id: String,
    pub instagram_account_id: String,
    pub comment_id: String,
    pub source: String,
    pub seen_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct TrackedLink {
    pub id: String,
    pub workspace_id: String,
    pub automation_id: String,
    pub slug: String,
    pub label: Option<String>,
    pub destination_url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct LinkClick {
    pub id: String,
    pub workspace_id: String,
    pub automation_id: String,
    pub instagram_account_id: String,
    pub tracked_link_id: String,
    pub ip_hash: Option<String>,
    pub user_agent: Option<String>,
    pub referrer: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]
pub struct WebhookEvent {
    pub id: String,
    pub workspace_id: Option<String>,
    pub object: Option<String>,
    pub payload: Json,
    pub status: WebhookStatus,
    pub error_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub processed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, FromRow)]
pub struct OperationalEvent {
    pub id: String,
    pub workspace_id: Option<String>,
    pub source: OperationalEventSource,
    pub level: OperationalEventLevel,
    pub message: String,
    pub payload: Option<Json>,
    pub created_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
}

/// Mobile OTP sign-in code. Deliberately separate from `VerificationToken`
/// (see schema comment) — that table backs an unthrottled Auth.js route, so
/// a 6-digit code there would be brute-forceable.
#[derive(Debug, Clone, FromRow)]
pub struct MobileAuthCode {
    pub id: String,
    pub email: String,
    pub code_hash: String,
    pub expires_at: DateTime<Utc>,
    pub attempts: i32,
    pub consumed_at: Option<DateTime<Utc>>,
    pub request_ip: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Linked to `Session.id` **by convention only** — not a real foreign key,
/// deliberately, so the Auth.js-owned `Session` model is never touched by
/// this feature. Preserve that non-relation; don't add an FK constraint.
#[derive(Debug, Clone, FromRow)]
pub struct MobileSessionMeta {
    pub id: String,
    pub session_id: String,
    pub device_name: Option<String>,
    pub platform: String,
    pub app_version: Option<String>,
    pub last_seen_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// `fcm_token` — renamed from `expo_push_token` in this session's FCM
/// migration (see `prisma/migrations/20260803120000_rename_push_token_to_fcm`).
#[derive(Debug, Clone, FromRow)]
pub struct PushDevice {
    pub id: String,
    pub user_id: String,
    pub fcm_token: String,
    pub platform: String,
    pub app_version: Option<String>,
    pub device_name: Option<String>,
    pub lead_alerts: bool,
    pub failure_alerts: bool,
    pub disabled_at: Option<DateTime<Utc>>,
    pub last_seen_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}
