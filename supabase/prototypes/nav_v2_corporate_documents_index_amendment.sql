-- REPOSITORY-ONLY PROTOTYPE AMENDMENT.
-- Apply after nav_v2_corporate_documents.sql in an isolated test environment only.

 drop index if exists public.nav_corporate_documents_active_unique_idx;

create unique index nav_corporate_documents_active_unique_idx
  on public.nav_deal_corporate_documents_v2(deal_id, party_side, document_type)
  where status <> 'cancelled'
    and not (
      coalesce(outcome_state, '') = 'confirmed'
      and coalesce(outcome_code, '') in ('not_applicable', 'replaced', 'cancelled')
    );

-- Normal rows with null outcome fields are included in this index.
