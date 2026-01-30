exports.up = (pgm) => {
  pgm.sql(`
    -- Drop existing foreign keys
    ALTER TABLE media_items DROP CONSTRAINT IF EXISTS fk_media_items_textbook_id;
    ALTER TABLE sections DROP CONSTRAINT IF EXISTS fk_sections_textbook_id;
    ALTER TABLE sections DROP CONSTRAINT IF EXISTS fk_sections_parent_section_id;
    ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_document_chunks_textbook_id;
    ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_document_chunks_section_id;
    ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_document_chunks_media_item_id;
    ALTER TABLE embeddings DROP CONSTRAINT IF EXISTS fk_embeddings_chunk_id;
    ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS fk_chat_sessions_textbook_id;
    ALTER TABLE faq_cache DROP CONSTRAINT IF EXISTS fk_faq_cache_textbook_id;

    -- Re-add foreign keys with ON DELETE CASCADE
    ALTER TABLE media_items 
      ADD CONSTRAINT fk_media_items_textbook_id 
      FOREIGN KEY (textbook_id) 
      REFERENCES textbooks(id) 
      ON DELETE CASCADE;

    ALTER TABLE sections 
      ADD CONSTRAINT fk_sections_textbook_id 
      FOREIGN KEY (textbook_id) 
      REFERENCES textbooks(id) 
      ON DELETE CASCADE;

    ALTER TABLE sections 
      ADD CONSTRAINT fk_sections_parent_section_id 
      FOREIGN KEY (parent_section_id) 
      REFERENCES sections(id) 
      ON DELETE CASCADE;

    ALTER TABLE chat_sessions 
      ADD CONSTRAINT fk_chat_sessions_textbook_id 
      FOREIGN KEY (textbook_id) 
      REFERENCES textbooks(id) 
      ON DELETE CASCADE;

    ALTER TABLE faq_cache 
      ADD CONSTRAINT fk_faq_cache_textbook_id 
      FOREIGN KEY (textbook_id) 
      REFERENCES textbooks(id) 
      ON DELETE CASCADE;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Drop cascading foreign keys
    ALTER TABLE media_items DROP CONSTRAINT IF EXISTS fk_media_items_textbook_id;
    ALTER TABLE sections DROP CONSTRAINT IF EXISTS fk_sections_textbook_id;
    ALTER TABLE sections DROP CONSTRAINT IF EXISTS fk_sections_parent_section_id;
    ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_document_chunks_textbook_id;
    ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_document_chunks_section_id;
    ALTER TABLE document_chunks DROP CONSTRAINT IF EXISTS fk_document_chunks_media_item_id;
    ALTER TABLE embeddings DROP CONSTRAINT IF EXISTS fk_embeddings_chunk_id;
    ALTER TABLE chat_sessions DROP CONSTRAINT IF EXISTS fk_chat_sessions_textbook_id;
    ALTER TABLE faq_cache DROP CONSTRAINT IF EXISTS fk_faq_cache_textbook_id;

    -- Re-add original foreign keys without CASCADE
    ALTER TABLE media_items ADD CONSTRAINT fk_media_items_textbook_id FOREIGN KEY (textbook_id) REFERENCES textbooks(id);
    ALTER TABLE sections ADD CONSTRAINT fk_sections_textbook_id FOREIGN KEY (textbook_id) REFERENCES textbooks(id);
    ALTER TABLE sections ADD CONSTRAINT fk_sections_parent_section_id FOREIGN KEY (parent_section_id) REFERENCES sections(id);
    ALTER TABLE document_chunks ADD CONSTRAINT fk_document_chunks_textbook_id FOREIGN KEY (textbook_id) REFERENCES textbooks(id);
    ALTER TABLE document_chunks ADD CONSTRAINT fk_document_chunks_section_id FOREIGN KEY (section_id) REFERENCES sections(id);
    ALTER TABLE document_chunks ADD CONSTRAINT fk_document_chunks_media_item_id FOREIGN KEY (media_item_id) REFERENCES media_items(id);
    ALTER TABLE embeddings ADD CONSTRAINT fk_embeddings_chunk_id FOREIGN KEY (chunk_id) REFERENCES document_chunks(id);
    ALTER TABLE chat_sessions ADD CONSTRAINT fk_chat_sessions_textbook_id FOREIGN KEY (textbook_id) REFERENCES textbooks(id);
    ALTER TABLE faq_cache ADD CONSTRAINT fk_faq_cache_textbook_id FOREIGN KEY (textbook_id) REFERENCES textbooks(id);
  `);
};
