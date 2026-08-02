const { Pool } = require("pg");

// Postgres persistence: users (display name + long-term summary) and
// messages (per-user chat turns). The schema is identical to the original Go
// bot's, so an existing database carries over as-is.
class Store {
    constructor(databaseUrl) {
        this.pool = new Pool({ connectionString: databaseUrl });
    }

    async init() {
        await this.pool.query(`
CREATE TABLE IF NOT EXISTS users (
    discord_user_id TEXT PRIMARY KEY,
    display_name    TEXT NOT NULL DEFAULT '',
    summary         TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    discord_user_id TEXT NOT NULL REFERENCES users(discord_user_id),
    channel_id      TEXT NOT NULL,
    role            TEXT NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_user_time
    ON messages (discord_user_id, created_at DESC);
`);
    }

    async close() {
        await this.pool.end();
    }

    async upsertUser(id, displayName) {
        await this.pool.query(`
INSERT INTO users (discord_user_id, display_name)
VALUES ($1, $2)
ON CONFLICT (discord_user_id)
DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
`, [id, displayName]);
    }

    async getSummary(id) {
        const { rows } = await this.pool.query(
            `SELECT summary FROM users WHERE discord_user_id = $1`, [id]);
        return rows[0]?.summary ?? "";
    }

    async setSummary(id, summary) {
        await this.pool.query(
            `UPDATE users SET summary = $2, updated_at = now() WHERE discord_user_id = $1`,
            [id, summary]);
    }

    async addMessage(userId, channelId, role, content) {
        await this.pool.query(`
INSERT INTO messages (discord_user_id, channel_id, role, content)
VALUES ($1, $2, $3, $4)
`, [userId, channelId, role, content]);
    }

    // Last `limit` turns for a user, oldest-first (ready to drop straight
    // into a chat payload). This is the short-term memory.
    async recentMessages(userId, limit) {
        const { rows } = await this.pool.query(`
SELECT role, content, created_at FROM (
    SELECT role, content, created_at
    FROM messages
    WHERE discord_user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
) t
ORDER BY created_at ASC
`, [userId, limit]);
        return rows;
    }

    async countMessages(userId) {
        const { rows } = await this.pool.query(
            `SELECT count(*)::int AS n FROM messages WHERE discord_user_id = $1`, [userId]);
        return rows[0].n;
    }

    // Every turn for a user, oldest-first. Used to rebuild the long-term summary.
    async allMessages(userId) {
        const { rows } = await this.pool.query(`
SELECT role, content, created_at
FROM messages
WHERE discord_user_id = $1
ORDER BY created_at ASC
`, [userId]);
        return rows;
    }
}

module.exports = { Store };
