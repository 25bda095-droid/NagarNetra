-- Where the after-photo was taken (private: verifications are moderator-only), next to distance_m.
alter table public.verifications
  add column after_point extensions.geography(Point, 4326),
  add column accuracy_m real;
