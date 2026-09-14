-- Align the source-document status constraint with the OCR review workflow.
-- The client/RPC pipeline uses `ready` after OCR and `reviewed` after all candidates are resolved.

alter table after.source_documents
  drop constraint if exists source_documents_processing_status_check;

alter table after.source_documents
  add constraint source_documents_processing_status_check
  check (
    processing_status = any (
      array[
        'pending'::text,
        'processing'::text,
        'processed'::text,
        'ready'::text,
        'reviewed'::text,
        'failed'::text,
        'deleted'::text
      ]
    )
  );
