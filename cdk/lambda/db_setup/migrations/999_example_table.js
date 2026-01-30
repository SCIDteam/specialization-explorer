exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS example_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS example_table;`);
};
