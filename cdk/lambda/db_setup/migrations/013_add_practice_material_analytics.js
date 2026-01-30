exports.up = (pgm) => {
  pgm.sql(`
    -- Create practice_material_analytics table for tracking practice material generation
    CREATE TABLE practice_material_analytics (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      textbook_id uuid NOT NULL,
      user_session_id uuid,
      material_type varchar(50) NOT NULL,
      topic text,
      num_items int,
      difficulty varchar(20) NOT NULL,
      metadata jsonb,
      created_at timestamptz DEFAULT now()
    );

    -- Add foreign key constraints
    ALTER TABLE practice_material_analytics 
      ADD CONSTRAINT fk_practice_material_analytics_textbook_id 
      FOREIGN KEY (textbook_id) 
      REFERENCES textbooks(id) 
      ON DELETE CASCADE;

    ALTER TABLE practice_material_analytics 
      ADD CONSTRAINT fk_practice_material_analytics_user_session_id 
      FOREIGN KEY (user_session_id) 
      REFERENCES user_sessions(id) 
      ON DELETE SET NULL;

    -- Create indexes for common query patterns
    -- Index for textbook-specific analytics over time
    CREATE INDEX idx_practice_material_analytics_textbook_created 
      ON practice_material_analytics(textbook_id, created_at DESC);

    -- Index for material type analytics over time
    CREATE INDEX idx_practice_material_analytics_type_created 
      ON practice_material_analytics(material_type, created_at DESC);

    -- Index for user session analytics
    CREATE INDEX idx_practice_material_analytics_user_session 
      ON practice_material_analytics(user_session_id) 
      WHERE user_session_id IS NOT NULL;

    -- Add comments for documentation
    COMMENT ON TABLE practice_material_analytics IS 'Tracks practice material generation for analytics and reporting';
    COMMENT ON COLUMN practice_material_analytics.material_type IS 'Type of practice material: mcq, flashcards, shortAnswer';
    COMMENT ON COLUMN practice_material_analytics.topic IS 'User-provided topic or subject for the practice material';
    COMMENT ON COLUMN practice_material_analytics.num_items IS 'Number of questions or cards generated';
    COMMENT ON COLUMN practice_material_analytics.difficulty IS 'Difficulty level: beginner, intermediate, advanced';
    COMMENT ON COLUMN practice_material_analytics.metadata IS 'Additional type-specific details (numOptions, cardType, etc.)';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS practice_material_analytics CASCADE;
  `);
};
