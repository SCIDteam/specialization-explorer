exports.up = async (pgm) => {
    pgm.sql(`
      ALTER TABLE chat_sessions 
      ADD COLUMN name VARCHAR(55);
    `);
}