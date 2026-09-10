-- Cover the foreign keys introduced by the school/OCR core.
create index if not exists after_academic_items_source_document_idx
  on after.academic_items(source_document_id)
  where source_document_id is not null;

create index if not exists after_calendar_events_source_document_idx
  on after.calendar_events(source_document_id)
  where source_document_id is not null;

create index if not exists after_academic_materials_created_by_idx
  on after.academic_materials(created_by);
