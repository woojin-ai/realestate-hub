-- 야간 프리워밍(Vercel Cron, app/api/cron/prewarm) 진행 상태 저장 (2026-07-15 신규)
--
-- 서버리스 함수 실행시간 제한(현재 route는 maxDuration=60s) 안에 전국 지역(lib/regions.ts
-- REGION_CODES 전체 시/도×구, 약 110여개)을 한 번에 다 프리워밍할 수 없으므로, 매 실행마다
-- "다음에 이어서 처리할 지역 인덱스"를 이 테이블에 저장해 두고 다음 크론 실행 때 이어서 진행한다.
-- 단일 행(id=1)만 사용한다.
--
-- 적용은 사용자(마스터) 몫이다. 이 테이블이 아직 없어도 Route Handler는 try/catch 폴백으로
-- 매번 인덱스 0부터 다시 시작할 뿐 죽지 않는다(다른 apt_*.sql과 동일한 무중단 원칙).

create table if not exists prewarm_progress (
  id int primary key default 1,
  last_index int not null default 0,
  updated_at timestamptz not null default now()
);

-- RLS: 내부 크론 전용 테이블이므로 익명 접근을 막는다(서비스 롤만 읽고 쓴다).
alter table prewarm_progress enable row level security;
