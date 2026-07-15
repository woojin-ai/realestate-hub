-- 아파트 상세 모달 — 주변 시설(Stage 3) 영속 캐시 (기획안 §2-C)
--
-- 카카오 로컬(SC4 카테고리 + 학교급 keyword 폴백) 조회 결과를 (lawd_cd,name,dong)
-- 자연키로 영속 저장한다. payload에 주변시설 응답을 원본 형태 그대로(jsonb) 담는다.
-- 2026-07-15: 학교(초/중/고)+어린이집(국공립/사립)+대형병원+동물병원+편의시설(마트/편의점/
-- 카페/음식점/약국/은행)까지 전부 payload에 채운다. jsonb 컬럼이라 스키마 변경 불필요 —
-- 키가 늘어나도(payload 형태 확장) 이 테이블 정의는 그대로 수용한다.
--
-- 주변시설은 상권 변동으로 값이 변하므로 장기 캐시(90일 TTL)로 둔다. 라우트는 fetched_at
-- 기준 90일 이내면 payload를 즉시 반환(카카오 0콜), 초과면 미스로 보고 라이브 재조회한다
-- (기획안 §2-C). 좌표는 apt_geo에서 얻어 카카오 호출 입력으로 쓴다(조인 키 통일).
--
-- 적용은 사용자(마스터) 몫이다. 이 테이블이 아직 없어도 Route Handler는 try/catch 폴백으로
-- 죽지 않고 카카오 라이브 호출만으로 동작한다(저장은 건너뜀). apt_geo.sql / apt_info.sql 동일 스타일.

create table if not exists apt_nearby (
  id uuid primary key default gen_random_uuid(),
  lawd_cd text not null,                    -- 시군구코드 5자리 (예: 11680)
  name text not null,                       -- 단지/건물명 (AptStat.name, 정규화 전 원문)
  dong text not null default '',            -- 법정동명 (AptStat.dong, 없으면 '')
  payload jsonb not null,                   -- {elementary,middle,high,...} 원본 응답 형태 그대로
  fetched_at timestamptz not null default now(),
  -- 단지 자연키(apt_geo/apt_info와 조인 키 통일): 같은 지역·단지·법정동은 한 행만 유지
  unique (lawd_cd, name, dong)
);

create index if not exists idx_apt_nearby_lawd on apt_nearby (lawd_cd);

-- RLS: 공공/파생 정보이므로 익명 SELECT 허용, 쓰기는 서비스 롤(서버)만.
alter table apt_nearby enable row level security;
create policy "public read apt_nearby" on apt_nearby for select using (true);
