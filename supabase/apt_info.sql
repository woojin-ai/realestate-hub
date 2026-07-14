-- 아파트 상세 모달 — 단지 정보(Stage 2) 영속 캐시 (기획안 §2-B)
--
-- MOLIT AptBasisInfoServiceV4(Bass/Dtl) 조회 결과와 해결된 kaptCode를 (lawd_cd,name,dong)
-- 자연키로 영속 저장한다. kaptCode를 이 행에 함께 저장하는 것이 핵심 — 원본(Flask)은
-- kaptCode를 찾으려 구 전체 단지목록(getSigunguAptList3)을 매번 로드했지만, 신 프로젝트는
-- 단지별 kaptCode를 1회만 영속화해 재방문 시 구목록 재로드·MOLIT 재호출을 모두 건너뛴다.
--
-- 음성 캐시(found=false, kapt_code=null): kaptCode 매칭 실패 단지의 무한 재조회를 억제한다
-- (원본 {found:false} 계승). 단 fetched_at 기준 30일 지난 found=false는 라우트가 미스로 보고
-- 라이브 재시도한다(API 개선 후 갱신 허용, 기획안 §2-B).
--
-- 적용은 사용자(마스터) 몫이다. 이 테이블이 아직 없어도 Route Handler는 try/catch 폴백으로
-- 죽지 않고 MOLIT 라이브 호출만으로 동작한다(저장은 건너뜀). apt_geo.sql과 동일 스타일.

create table if not exists apt_info (
  id uuid primary key default gen_random_uuid(),
  lawd_cd text not null,                    -- 시군구코드 5자리 (예: 11680)
  name text not null,                       -- 단지/건물명 (AptStat.name, 정규화 전 원문)
  dong text not null default '',            -- 법정동명 (AptStat.dong, 없으면 '')
  kapt_code text,                           -- 해결된 kaptCode (null=매칭 실패 음성 캐시)
  households int,                           -- 세대수 (kaptdaCnt || hoCnt)
  buildings int,                            -- 동수 (kaptDongCnt)
  hallway text,                             -- 복도유형 (codeHallNm)
  heating text,                             -- 난방방식 (codeHeatNm)
  elev_pass int,                            -- 승강기수 (후순위, null 빈발)
  elev_per_hh double precision,             -- 세대당 승강기 (파생, hh>0일 때만)
  park_above int,                           -- 지상 주차 (kaptdPcnt)
  park_under int,                           -- 지하 주차 (kaptdPcntu)
  park_total int,                           -- 총 주차 (above+under)
  far_ratio text,                           -- 용적률 (건축HUB, 후순위 — 이번 Stage는 항상 null)
  cov_ratio text,                           -- 건폐율 (건축HUB, 후순위 — 이번 Stage는 항상 null)
  addr text,                                -- 주소 (kaptAddr || doroJuso)
  found boolean not null default false,     -- 조회 성공 여부(원본 {found:false} 계승, 음성 캐시)
  fetched_at timestamptz not null default now(),
  -- 단지 자연키(apt_geo/apt_nearby와 조인 키 통일): 같은 지역·단지·법정동은 한 행만 유지
  unique (lawd_cd, name, dong)
);

create index if not exists idx_apt_info_lawd on apt_info (lawd_cd);

-- RLS: 공공/파생 정보이므로 익명 SELECT 허용, 쓰기는 서비스 롤(서버)만.
alter table apt_info enable row level security;
create policy "public read apt_info" on apt_info for select using (true);
