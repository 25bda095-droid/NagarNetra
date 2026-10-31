-- Public feed and "solved" gallery: blurred after-photo on the incident, and the responsible
-- authority's contact channels in the public view (new columns are appended, so the view can be replaced).
alter table public.incidents add column fixed_photo_path text;   -- blurred after-photo in the public bucket

create or replace view public.public_incidents with (security_invoker = true) as
select
  i.id,
  i.category,
  c.labels ->> 'en'                    as category_label,
  i.subtype,
  i.other_description,
  i.summary,
  extensions.st_y(i.point::extensions.geometry) as lat,
  extensions.st_x(i.point::extensions.geometry) as lon,
  i.status,
  i.severity_score,
  i.severity_band,
  i.state_lgd,
  i.district_lgd,
  i.local_body_lgd,
  i.ward_name,
  i.admin_chain,
  i.authority_id,
  a.name                               as authority_name,
  a.verification_status                as authority_verification,
  i.routing_confidence,
  i.routing_status,
  i.routing_reason,
  i.independent_reporters,
  i.report_count,
  i.cover_photo_path,
  i.created_at,
  i.updated_at,
  i.resolved_at,
  i.fixed_photo_path,
  a.portal_url                         as authority_portal_url,
  a.helpline                           as authority_helpline,
  a.agency_type                        as authority_agency_type,
  i.ticket_id
from public.incidents i
join public.categories c on c.code = i.category
left join public.authorities a on a.id = i.authority_id;
