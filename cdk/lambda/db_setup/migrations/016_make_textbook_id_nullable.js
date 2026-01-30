exports.up = (pgm) => {
  pgm.sql(`
    -- Make textbook_id nullable to allow job creation before textbook exists (for new ingestions)
    ALTER TABLE jobs ALTER COLUMN textbook_id DROP NOT NULL;
    
    -- Drop the foreign key constraint temporarily
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS fk_jobs_textbook_id;
    
    -- Re-add foreign key constraint that allows NULL
    -- This way, new ingestions can create a job without a textbook_id
    -- and update it later when the textbook is created by the Glue job
    ALTER TABLE jobs ADD CONSTRAINT fk_jobs_textbook_id 
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Revert: Make textbook_id NOT NULL again
    -- Note: This will fail if there are any rows with NULL textbook_id
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS fk_jobs_textbook_id;
    ALTER TABLE jobs ALTER COLUMN textbook_id SET NOT NULL;
    ALTER TABLE jobs ADD CONSTRAINT fk_jobs_textbook_id 
      FOREIGN KEY (textbook_id) REFERENCES textbooks(id) ON DELETE CASCADE;
  `);
};
