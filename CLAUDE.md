@AGENTS.md

# 부동산 실거래가 대시보드 (Next.js + Supabase 재구축)

원본 프로젝트: `C:\bitcoin_vdcode\realestate` (Flask + ngrok, 로컬 상시 운영). 이 저장소는 그 기능을 Next.js + Supabase + Vercel 구조로 이관해 ngrok 없이 상시 배포하는 것이 목표다.

## 팀 구조
마스터(오케스트레이터) 아래 6개 팀: planning-team(기획), design-team(디자인), dev-team(개발), qa-team(QA), marketing-team(마케팅홍보), cs-team(CS). 각 팀 정의는 `.claude/agents/*.md`.

## 작업 순서 원칙
새 화면/기능: planning-team(데이터·기능 정의) → design-team(화면 구성안) → dev-team(구현) → qa-team(원본 대조 검증, PASS 필수) → 마스터 최종 확인 → `git push origin main`(Vercel 자동배포).
버그 수정/로직 이관처럼 새 화면이 아닌 작업은 곧장 dev-team → qa-team으로 진행 가능.

## 핵심 문서
- `docs/planning/migration-architecture.md` — Flask→Next.js+Supabase 마이그레이션 아키텍처/로드맵
- `supabase/schema.sql` — DB 스키마
- `docs/supabase-vercel-setup-guide.md` — 사용자가 직접 해야 하는 계정/연동 단계 안내
- `docs/team-log/` — 일일 작업 로그(스케줄 작업이 이어서 참고)

## 원본 참고 시 주의
원본 Flask 코드(`C:\bitcoin_vdcode\realestate`)의 계산 로직(변동률, 재건축 배지 판정 등)과 API 호출 방식(서비스키 이중인코딩 방지 등 특이사항)은 임의로 재해석하지 말고 실제 코드를 Read해서 그대로 파악한 뒤 포팅한다.
