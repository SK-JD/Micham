create index if not exists micham_entities_owner_updated_idx
on public.micham_entities(owner_id, updated_at);

create index if not exists micham_entities_owner_type_updated_idx
on public.micham_entities(owner_id, entity_type, updated_at);
