exports.up = (pgm) => {
  pgm.sql(`
    -- Add glue_job_run_id column to track CloudWatch logs
    ALTER TABLE jobs 
    ADD COLUMN glue_job_run_id varchar(255);
    
    -- Create index for efficient lookups by Glue job run ID
    CREATE INDEX idx_jobs_glue_run_id ON jobs(glue_job_run_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_jobs_glue_run_id;
    ALTER TABLE jobs DROP COLUMN IF EXISTS glue_job_run_id;
  `);
};
