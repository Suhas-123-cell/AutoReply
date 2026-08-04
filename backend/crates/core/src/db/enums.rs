//! Postgres native enum types, ported 1:1 from `prisma/schema.prisma`.
//! `sqlx::Type` with `rename_all = "UPPERCASE"` matches Prisma's own enum
//! value naming (Prisma emits the Rust/TS-style variant names as-is into
//! Postgres, e.g. `CREATE TYPE "DmStatus" AS ENUM ('PENDING', 'SENT', ...)`).

use sqlx::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, serde::Serialize, serde::Deserialize)]
#[sqlx(type_name = "WorkspaceRole", rename_all = "UPPERCASE")]
#[serde(rename_all = "UPPERCASE")]
pub enum WorkspaceRole {
    Owner,
    Admin,
    Member,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, serde::Serialize, serde::Deserialize)]
#[sqlx(type_name = "WorkspaceInvitationStatus", rename_all = "UPPERCASE")]
#[serde(rename_all = "UPPERCASE")]
pub enum WorkspaceInvitationStatus {
    Pending,
    Accepted,
    Revoked,
    Expired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, serde::Serialize, serde::Deserialize)]
#[sqlx(type_name = "DmStatus", rename_all = "UPPERCASE")]
#[serde(rename_all = "UPPERCASE")]
pub enum DmStatus {
    Pending,
    Sent,
    Failed,
    SkippedDedup,
    SkippedRateLimit,
    SkippedPlanLimit,
    SkippedNoMatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, serde::Serialize, serde::Deserialize)]
#[sqlx(type_name = "WebhookStatus", rename_all = "UPPERCASE")]
#[serde(rename_all = "UPPERCASE")]
pub enum WebhookStatus {
    Pending,
    Processed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, serde::Serialize, serde::Deserialize)]
#[sqlx(type_name = "OperationalEventSource", rename_all = "UPPERCASE")]
#[serde(rename_all = "UPPERCASE")]
pub enum OperationalEventSource {
    Worker,
    TokenRefresh,
    Health,
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Type, serde::Serialize, serde::Deserialize)]
#[sqlx(type_name = "OperationalEventLevel", rename_all = "UPPERCASE")]
#[serde(rename_all = "UPPERCASE")]
pub enum OperationalEventLevel {
    Info,
    Warning,
    Error,
}
