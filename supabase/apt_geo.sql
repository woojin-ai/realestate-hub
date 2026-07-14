-- AI 맞춤 추천 — 단지 좌표/최근접지하철 영속 캐시 (migration-architecture 5단계 부가기능)
--
-- 좌표·최근접 지하철 거리는 단지 특성상 거의 불변이므로 "만료 없는 영속 캐시"로 둔다.
-- (기획 docs/planning/ai-recommend.md §2: 두 번째 조회부터 외부호출 0에 수렴)
--
-- 적용은 사용자(마스터) 몫이다. 이 테이블이 아직 없어도 Route Handler는
-- try/catch 폴백으로 죽지 않고 카카오 라이브 호출만으로 동작한다(저장은 건너뜀).
--
-- supabase/schema.sql 스타일에 맞춤(자연키 unique, RLS 공개읽기 + service_role 쓰기).

create table if not exists apt_geo (
  id uuid primary key default gen_random_uuid(),
  lawd_cd text not null,                 -- 법정동 시군구코드 (예: 11680)
  name text not null,                    -- 단지/건물명 (buildAptStats의 AptStat.name)
  dong text not null default '',         -- 법정동명 (AptStat.dong, 없으면 '')
  lat double precision,                  -- 위도 (카카오 좌표 y). 지오코딩 실패 시 null
  lng double precision,                  -- 경도 (카카오 좌표 x). 지오코딩 실패 시 null
  subway_name text not null default '-', -- 최근접 지하철역명 (미확인 '-')
  subway_dist int not null default 9999, -- 최근접 지하철 도보거리(m). 미확인 9999(원본 규약)
  geocoded_at timestamptz not null default now(),
  -- 단지 자연키(추천 후보 매칭 키와 동일): 같은 지역·단지·법정동은 한 행만 유지
  unique (lawd_cd, name, dong)
);

create index if not exists idx_apt_geo_lawd on apt_geo (lawd_cd);

-- RLS: 공공/파생 정보이므로 익명 SELECT 허용, 쓰기는 서비스 롤(서버)만.
alter table apt_geo enable row level security;
create policy "public read apt_geo" on apt_geo for select using (true);
