-- 아파트 상세 모달 위치 섹션 — 경사도 복원 (2026-07-15, 사용자 명시 지시로 재추가)
--
-- 이전 라운드에서 "경사도(slope_score/route_slope) 필드 없음"으로 apt-location 응답에서
-- 제외했으나, 사용자가 원본 대비 핵심 장점으로 지목해 명시적으로 복원을 지시함.
-- 기존 apt_geo 테이블(supabase/apt_geo.sql)에 컬럼만 추가하는 마이그레이션.
--
-- slope_score: 단지 주변 지형 경사도 점수(원본 recommender.py get_slope_score_vworld 이관).
--   실제로는 VWorld가 아니라 opentopodata(srtm30m) 우선 → open-elevation.com 폴백으로
--   구한 고도 배치의 고도범위(elev_range)로 점수화한다(함수명은 원본 이름 그대로 유지,
--   docs/planning/apt-detail-full-restore.md §0-1 "사실 정정" 참고).
-- route_slope: 최근접 지하철역 → 단지까지 경로 경사(원본 get_route_slope_score 이관).
--   {score, elev_diff, elev_range, elev_start, elev_end, label} 형태 jsonb로 저장.
--
-- 적용은 사용자(마스터) 몫. 컬럼이 없어도 Route Handler는 기존과 동일하게 폴백 동작한다
-- (select 시 컬럼 없으면 에러 → try/catch로 라이브 재계산, 캐시만 못 씀).

alter table apt_geo
  add column if not exists slope_score int,              -- 단지 주변 경사도 점수(0~100), 계산 불가 시 null
  add column if not exists route_slope jsonb;             -- 역→단지 경로 경사 {score,elev_diff,elev_range,elev_start,elev_end,label}, 계산 불가 시 null
