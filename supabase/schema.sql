-- 부동산 실거래가 대시보드 — Supabase(Postgres) 스키마
-- 원본 로컬 캐시(C:\bitcoin_vdcode\realestate\data\<lawd_cd>_<건물유형>.json)를 대체한다.
-- 원본 레코드 필드(fetcher.py 확인 결과):
--   매매: deal_type, building_type, name, dong, price, area, floor, build_year, year, month, day
--   전세/월세: deal_type, building_type, name, dong, deposit, monthly, area, floor, build_year, year, month, day, contract_type

create extension if not exists pgcrypto;

-- 실거래가 원자료(매매/전세/월세 공통 테이블, deal_type으로 구분)
create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  lawd_cd text not null,                 -- 법정동 시군구코드 (예: 11680)
  building_type text not null check (building_type in ('아파트', '빌라', '단독')),
  deal_type text not null check (deal_type in ('매매', '전세', '월세')),
  name text not null,                    -- 단지/건물명
  dong text,                             -- 법정동명
  price numeric,                         -- 매매가 (만원, deal_type='매매'일 때만)
  deposit numeric,                       -- 보증금 (만원, 전세/월세)
  monthly numeric,                       -- 월세 (만원, 월세일 때만 0 초과)
  area numeric not null,                 -- 전용면적(㎡)
  floor text,
  build_year text,
  deal_year int not null,
  deal_month int not null,
  deal_day int,
  contract_type text,                    -- 갱신/신규 등 (전월세)
  is_apt_filtered boolean not null default true, -- analyzer.py의 오피스텔/도시형 필터 결과 (false=제외 대상)
  raw jsonb,                             -- 원본 API 응답 원문 보존(감사/재처리용)
  created_at timestamptz not null default now(),
  -- 국토부 API가 동일 거래를 재신고/정정 시 중복 적재를 막기 위한 자연키
  unique (lawd_cd, building_type, deal_type, name, dong, area, floor, deal_year, deal_month, deal_day, price, deposit, monthly)
);

create index if not exists idx_deals_region_period on deals (lawd_cd, building_type, deal_type, deal_year, deal_month);
create index if not exists idx_deals_name on deals (lawd_cd, name);

-- 지역×건물유형×거래유형별 최근 수집 상태 (원본 fetcher.py의 파일 단위 캐시를 대체)
create table if not exists fetch_cache_status (
  lawd_cd text not null,
  building_type text not null,
  months_collected int not null default 0,   -- 몇 개월치 수집됐는지
  last_fetched_at timestamptz,
  last_deal_ym text,                          -- 마지막으로 수집 시도한 YYYYMM
  status text not null default 'pending' check (status in ('pending', 'collecting', 'ready', 'error')),
  error_message text,
  primary key (lawd_cd, building_type)
);

-- 월별 요약 통계 (analyzer.py build_summary 결과 캐시 — 매 요청마다 재계산하지 않도록)
create table if not exists monthly_stats (
  lawd_cd text not null,
  building_type text not null,
  deal_type text not null,
  deal_ym text not null,               -- YYYYMM
  avg_price numeric,                   -- 매매: 평균 매매가 / 전세: 평균 보증금
  deal_count int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (lawd_cd, building_type, deal_type, deal_ym)
);

-- 알림 이력 (notifier.py의 텔레그램 발송 로그 — 중복 알림 방지 + 감사용)
create table if not exists alert_log (
  id uuid primary key default gen_random_uuid(),
  lawd_cd text not null,
  building_type text not null,
  deal_type text not null,
  change_pct numeric not null,
  message text not null,
  sent_at timestamptz not null default now(),
  channel text not null default 'telegram'
);

-- 관심 지역 (원본에 없던 신규 기능 후보 — 로그인 없이 브라우저 로컬스토리지로 대체 가능하므로 기본 비활성.
-- 추후 사용자 계정 기능이 생기면 사용)
-- create table if not exists watchlist ( ... );

-- RLS: 모든 데이터는 공공데이터 기반 읽기 전용 정보이므로 익명 SELECT만 허용, 쓰기는 서비스 롤(서버)만 가능.
alter table deals enable row level security;
alter table fetch_cache_status enable row level security;
alter table monthly_stats enable row level security;
alter table alert_log enable row level security;

create policy "public read deals" on deals for select using (true);
create policy "public read monthly_stats" on monthly_stats for select using (true);
create policy "public read fetch_cache_status" on fetch_cache_status for select using (true);
-- alert_log는 공개하지 않음(내부 운영 로그) — 정책 없음 = anon 접근 불가, service_role만 접근.
