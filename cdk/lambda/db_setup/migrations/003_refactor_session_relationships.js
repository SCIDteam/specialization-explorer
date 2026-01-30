exports.up = (pgm) => {
  pgm.sql(`
    -- Drop existing foreign key constraints that will be affected
    ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS fk_chat_sessions_user_sessions_session_id;
    ALTER TABLE user_interactions DROP CONSTRAINT IF EXISTS fk_user_interactions_session_id;
    ALTER TABLE shared_user_prompts DROP CONSTRAINT IF EXISTS fk_shared_user_prompts_owner_session_id;
    ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS fk_analytics_events_user_session_id;

    -- Remove the redundant session_id column from user_sessions
    ALTER TABLE user_sessions DROP COLUMN session_id;

    -- Update chat_sessions to reference user_sessions.id instead of session_id
    ALTER TABLE chat_sessions RENAME COLUMN user_sessions_session_id TO user_session_id;

    -- Replace session_id with chat_session_id in user_interactions table
    ALTER TABLE user_interactions DROP COLUMN session_id;
    ALTER TABLE user_interactions ADD COLUMN chat_session_id uuid;

    -- Re-establish foreign key constraints with the new structure
    ALTER TABLE chat_sessions 
    ADD CONSTRAINT fk_chat_sessions_user_session_id 
    FOREIGN KEY (user_session_id) REFERENCES user_sessions(id);

    ALTER TABLE user_interactions 
    ADD CONSTRAINT fk_user_interactions_chat_session_id 
    FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id);

    ALTER TABLE shared_user_prompts 
    ADD CONSTRAINT fk_shared_user_prompts_owner_session_id 
    FOREIGN KEY (owner_session_id) REFERENCES user_sessions(id);

    ALTER TABLE analytics_events 
    ADD CONSTRAINT fk_analytics_events_user_session_id 
    FOREIGN KEY (user_session_id) REFERENCES user_sessions(id);

    -- Add indexes for the new foreign key relationships
    CREATE INDEX IF NOT EXISTS idx_user_interactions_chat_session_id ON user_interactions(chat_session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_session_id ON chat_sessions(user_session_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Drop the new foreign key constraints
    ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS fk_chat_sessions_user_session_id;
    ALTER TABLE user_interactions DROP CONSTRAINT IF EXISTS fk_user_interactions_chat_session_id;
    ALTER TABLE shared_user_prompts DROP CONSTRAINT IF EXISTS fk_shared_user_prompts_owner_session_id;
    ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS fk_analytics_events_user_session_id;

    -- Drop the new indexes
    DROP INDEX IF EXISTS idx_user_interactions_chat_session_id;
    DROP INDEX IF EXISTS idx_chat_sessions_user_session_id;

    -- Restore the session_id column to user_sessions
    ALTER TABLE user_sessions ADD COLUMN session_id uuid NOT NULL DEFAULT uuid_generate_v4();

    -- Rename the chat_sessions column back to original name
    ALTER TABLE chat_sessions RENAME COLUMN user_session_id TO user_sessions_session_id;

    -- Replace chat_session_id with session_id in user_interactions table
    ALTER TABLE user_interactions DROP COLUMN chat_session_id;
    ALTER TABLE user_interactions ADD COLUMN session_id uuid;

    -- Restore original foreign key constraints
    ALTER TABLE chat_sessions 
    ADD CONSTRAINT fk_chat_sessions_user_sessions_session_id 
    FOREIGN KEY (user_sessions_session_id) REFERENCES user_sessions(session_id);

    ALTER TABLE user_interactions 
    ADD CONSTRAINT fk_user_interactions_session_id 
    FOREIGN KEY (session_id) REFERENCES user_sessions(session_id);

    ALTER TABLE shared_user_prompts 
    ADD CONSTRAINT fk_shared_user_prompts_owner_session_id 
    FOREIGN KEY (owner_session_id) REFERENCES user_sessions(session_id);

    ALTER TABLE analytics_events 
    ADD CONSTRAINT fk_analytics_events_user_session_id 
    FOREIGN KEY (user_session_id) REFERENCES user_sessions(session_id);
  `);
};
