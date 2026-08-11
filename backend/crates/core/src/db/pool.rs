//! Connection pooling and migrations.
//!
//! Both deployables share this: the worker holds one long-lived pool, while
//! each Vercel Function invocation opens a small one — hence `max_connections`
//! being a parameter rather than a constant. Serverless invocations should
//! stay in the low single digits to avoid exhausting Postgres when many
//! functions are warm at once.

use sqlx::migrate::{MigrateError, Migrator};
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

/// The migrations in `backend/migrations/`, embedded into the binary at
/// compile time so deploys carry their own schema and need no `sqlx-cli`.
pub static MIGRATOR: Migrator = sqlx::migrate!("../../migrations");

/// Opens a connection pool. Connections are established lazily, so this does
/// not fail on an unreachable database — call [`run_migrations`] or issue a
/// query to find that out.
pub fn connect(database_url: &str, max_connections: u32) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(10))
        .connect_lazy(database_url)
}

/// Applies any migrations the database has not seen yet. Safe to call on every
/// start: sqlx tracks applied versions in `_sqlx_migrations`, and the baseline
/// migration is itself idempotent against a database Prisma already built.
pub async fn run_migrations(pool: &PgPool) -> Result<(), MigrateError> {
    MIGRATOR.run(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Guards against the migration file being moved or renamed — `migrate!`
    /// resolves its path at compile time, so a missing directory is a build
    /// error, but an empty one is not.
    #[test]
    fn embeds_the_baseline_migration() {
        let versions: Vec<_> = MIGRATOR.iter().map(|m| m.version).collect();
        assert_eq!(versions, vec![20260811000000]);
    }

    /// Exercises the real sqlx runner rather than psql. Ignored by default
    /// because CI has no Postgres; run against a scratch database with:
    ///
    /// ```text
    /// DATABASE_URL=postgresql://postgres:postgres@localhost:5432/scratch \
    ///   cargo test -- --ignored
    /// ```
    #[tokio::test]
    #[ignore = "requires a live Postgres at $DATABASE_URL"]
    async fn migrations_apply_and_are_repeatable() {
        let url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
        let pool = connect(&url, 2).expect("pool");

        run_migrations(&pool).await.expect("first run");
        run_migrations(&pool).await.expect("second run should be a no-op");

        let tables: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM information_schema.tables \
             WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
        )
        .fetch_one(&pool)
        .await
        .expect("count tables");

        // 19 application tables plus sqlx's own `_sqlx_migrations`.
        assert_eq!(tables, 20);
    }
}
