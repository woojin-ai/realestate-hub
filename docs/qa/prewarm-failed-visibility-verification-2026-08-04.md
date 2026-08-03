# QA 독립 검증 — 프리워밍 실패 가시화(관측성) 수정

- 일자: 2026-08-04 (라운드59)
- 대상: `app/api/cron/prewarm/route.ts` (미커밋)
- 기준: `docs/team-log/2026-08-04-round59.md` §2
- 검증 방식: 손으로 옮겨적지 않고 **소스 텍스트를 파일에서 축자 추출 → TypeScript 5.9.3 transpile → Node 24.12.0 실행.** 개발팀 하네스는 열지 않고 전부 새로 작성.

## 종합 판정: **PASS** — 발견 4건 전부 저장소 코드에서 도달 불가한 방어심층 갭

> QA는 상위 규칙 충돌로 파일을 직접 쓰지 않고 보고로 반환했다. 마스터가 정본화했다.
> **F-4는 마스터가 이 라운드에 실제로 수정했다**(§F-4 참고). 나머지 F-1·F-2·F-3은 티켓으로 이월.

## 0. 마스터 실측치 재확인 — PASS

`lib/regions.ts`를 실제 로드해 `buildRegionList()`와 동일 순서로 평탄화:

```
총 114개. idx 106=광주 북구(29170) · 107=광주 광산구(29200) · 108=울산 중구(31110)
        · 109=울산 남구 · 110=동구 · 111=북구 · 112=울주군 · 113=세종 · 0=종로구
마스터 실측 인덱스↔지역 매핑 전부 일치? true
```

**HEAD 루프 원문을 그대로 실행해 실행 A를 재현했다:**

```
HEAD(수정 전), idx 106부터 6개 시도 중 앞 3개 throw:
   {"processedCount":3,"nextIndex":112}   → 전진칸수 6, processedCount 3 → 갭 3건 소실(마스터 실측 재현)
WORK(수정 후), 동일 시나리오:
   {"processedCount":3,"failedCount":3,"attemptedCount":6,"nextIndex":112}
   → 전진칸수 6 == attemptedCount 6 : true
```

→ 진단("갭 = 조용한 실패 건수")이 코드 원문으로 성립한다.

## 1. 제어 흐름 불변 증명 — PASS

주석을 전면 제거하고 양쪽을 transpile해 비교. 실행 코드 차이는 **정확히 5 hunk, 전부 가산**:
① 상수 3개 + 순수 함수 2개 신설 ② early-return 필드 3개 ③ `const failed = []` ④ catch에 `failed.push` ⑤ 응답 필드 3개.

**`prewarmRegion` 본문은 주석 제거 후 바이트 단위 동일** — diff에 한 줄도 없다.

동작 파라미터 토큰 카운트 HEAD == WORK: `prewarmRegion(` 2 · `TIME_BUDGET_MS` 2 · `25_000` 1 · `MAX_REGIONS_PER_RUN` 2 · `CONCURRENCY` 3 · `MONTHS` 4 · `saveProgress(` 2 · `count += 1` 1 · `idx = (idx + 1) % regions.length` 1 · `if (!incomplete)` 1 · `.upsert(` 1 · `.insert/.update/.delete` 0 · `maxDuration` 1. (유일한 차이 `"= 3"`은 신규 `MAX_ERROR_MESSAGE_LENGTH = 300` 때문이고 `CONCURRENCY = 3`은 양쪽 그대로.)

| 항목 | 실측 | 판정 |
|---|---|---|
| 실패 시 idx 전진 | `startIndex=50` throw → `nextIndex=51`, `saveProgress(51)` 1회 | PASS |
| `incomplete`가 인덱스를 붙잡음 | `incomplete:true` → `nextIndex=50` 유지 | PASS |
| throw 후 `incomplete` 오염 없음 | `let incomplete = false`가 매 회차 재선언 | PASS |
| DB 쓰기 무증가 | `failed[]`는 순수 메모리, 신규 DB 호출 0 | PASS |
| 시간예산 영향 없음 | 추가분 전부 동기, 루프 신규 `await` 0개 | PASS |

## 2. 검산식 `attemptedCount === processedCount + failedCount` — PASS

`processed.push(…)`가 try의 **마지막 문장**이고 `count += 1`이 try/catch **밖**이라 그 사이 throw 가능 지점이 없다. `count += 1`을 스킵하는 경로 없음(`continue`/`break` 0개). `saveProgress`는 내부에서 예외를 삼킨다.

**24시나리오 전부 성립** — 전부 성공(20/20/0) · 전부 throw(20/0/20) · 3연속 throw 후 성공(20/17/3) · incomplete 혼합 · throw 타입 7종 · 예산 즉시 소진(0/0/0) · 114지역 한 바퀴(114/114/0) · `prewarmRegion`이 undefined 반환 · message 2000자 × 20건 등.

## 3. 시크릿 유출 검증 — PASS (도달 가능한 모든 경로)

**`.env.local`의 실 프로덕션 시크릿 10개로 검증**(값 미출력, 문자 클래스만 검사 후 마스킹):

`MOLIT_API_KEY`(64) · `BLDRGST_API_KEY`(64) · `KAKAO_API_KEY`(32) · `VWORLD_API_KEY`(36) · `SUPABASE_ANON_KEY`(208) · `SUPABASE_SERVICE_ROLE_KEY`(219) · `CRON_SECRET`(64) · `RESEND_API_KEY`(36) — **전부 `&`·공백·따옴표 미포함** → `[^&\s"']+`가 값 전체를 삼켜 완전 마스킹. 유출 0.

| 케이스 | 출력 | 판정 |
|---|---|---|
| 실 molit URL이 message에 | `serviceKey=[REDACTED]&LAWD_CD=29170&DEAL_YMD=202607` | PASS |
| undici `fetch failed` + cause에 URL | `TypeError: fetch failed / cause: Error: connect ETIMEDOUT … serviceKey=[REDACTED]…` | PASS |
| PostgrestError plain object | `permission denied for table deals` — **`details`/`hint`/`code` 전부 부재** | PASS |
| PostgrestError **인스턴스**(`toJSON()` 보유) | name+message만 | PASS |
| `{url, headers:{apikey}}` 객체 throw | `[비Error 예외: object]` | PASS |
| `Bearer <토큰>` | `Bearer [REDACTED]` | PASS |
| `new Error()` / `throw null` / `throw undefined` / `throw 0` | `[빈 에러 메시지]` / `[비Error 예외: object]` / `…undefined]` / `…number]` | PASS |
| 대문자 `SERVICEKEY=` · 값이 문자열 끝 · URL 3회 반복 | 전부 `[REDACTED]` (`i`·`g` 플래그) | PASS |
| 시크릿이 300자 절단 경계에 걸침 | 마스킹이 절단 **앞**에서 일어나 유출 0 | PASS |
| 스택 문자열이 message에 섞임 | 개행 접힘 + URL 마스킹 | PASS |

**PostgrestError 실물 확인**: `node_modules/@supabase/postgrest-js/dist/index.mjs:55-84`에서 `PostgrestError extends Error`이고 **`toJSON()`이 `details`/`hint`/`code`를 내보낸다** — 객체를 통째로 넣었다면 `NextResponse.json`이 응답에 실었을 것이다. 코드가 `.name`/`.message`만 읽어 회피된다. `:415-435`상 `if (error) throw error`가 던지는 것은 plain object `{message, details, hint, code}`이며 3번 분기로 떨어져 message만 남는다.

**`err.stack` 응답 유입 경로 0**: `.stack` 프로퍼티 접근 0건, `String(err)`/`JSON.stringify(err)`/`util.inspect` 0건. 실 런타임 DNS 실패·연결 거부·타임아웃 3종에서 `err.stack`이 431~483자 존재하지만 출력에 미포함.

## 4. 에러 문자열 유용성 — PASS

`TimeoutError` · `AbortError` · `ETIMEDOUT` · `ENOTFOUND` · `socket hang up` · `RangeError` · 로컬 `TypeError` 전부 진단정보 생존.

**기존 관례보다 정보가 늘었다**: 저장소 관례 `err.message`는 `"fetch failed"` 하나만 주는데, `toSafeErrorMessage`는 `"TypeError: fetch failed / cause: Error: getaddrinfo ENOTFOUND …"`를 준다. 마스킹이 과한 게 아니다.

`failed[0]` 키 = `error, gu, lawdCd, sido` 정확히 4개 → `lawdCd`로 단건 재시도 가능.

## 5. 과잉 마스킹 — PASS (요구 케이스)

`LAWD_CD=29170` · `lawd_cd=29170` · `pageNo=3&numOfRows=1000` · `monthsCollected=13 status=ready` · `author=molit-api` · `code=42501` **전부 그대로 보존**. 브리핑이 우려한 지역코드 오탐은 발생하지 않는다(`key` alternative는 `key=` 리터럴을 요구하고 `LAWD_CD`에 `key` 부분문자열이 없다).

## 6. 응답 모양 회귀 — PASS

키 순서: `ok > processedCount > failedCount > attemptedCount > nextIndex > totalRegions > elapsedMs > processed > failed`.

기존 6필드 이름·타입·위치 생존, 삭제/개명 0건. `processedCount = processed.length`이고 실패는 별 배열이라 **"성공 지역 수" 의미 불변**(실패 3건이 있어도 성공 17만 셈). **소비자 조사**: 응답을 프로그램적으로 파싱하는 소비자 **0건**(문서 언급과 Vercel Cron 호출뿐, 크론은 본문을 읽지 않는다). 20건 전부 실패 + message 2000자 시나리오 응답 **7.4 KB**, 각 error 305자 절단 — 상한 작동 확인.

## 7. 타입·린트 — PASS

`npx tsc --noEmit` exit 0 · `npx eslint app/api/cron/prewarm/route.ts` exit 0 · `npm run lint` exit 0.

## 발견 사항

### F-4 (수정 완료 — 마스터가 이 라운드에 적용)

`toSafeErrorMessage`가 `err.name`/`.message`/`.cause`를 **읽으므로**, 그 프로퍼티가 throw하는 getter인 객체를 만나면 예외가 catch를 뚫고 루프 밖으로 나가 **라우트 전체가 500**이 된다. 응답이 사라지므로 **그 실행에서 이미 성공한 지역의 `processed`까지 함께 버려진다** — 관측성 수정이 관측 대상을 없애는 형태다.

HEAD 대조 실측: HEAD는 `console.error(msg, err)`의 `util.inspect`가 기본적으로 getter를 호출하지 않아 **생존**했다. 즉 이번 수정이 새로 들여온 유일한 동작 변화다.

```
HEAD / message·name 게터 throw : 생존 → {"processedCount":0,"attemptedCount":1,"nextIndex":1}
WORK / message·name·cause 게터 throw : >>> 루프 밖으로 예외 탈출 (응답 없음, 500)
```

도달성은 낮다(undici·postgrest 에러 모두 평범한 데이터 프로퍼티). **차단 사유는 아니었으나 방어 비용이 3줄이고 실패 시 대가가 "응답 소실"이라 마스터가 즉시 수정했다.** `failed.push`의 요약 계산을 자체 try/catch로 감싸고 폴백 `"[에러 요약 실패: 프로퍼티 접근이 예외를 던졌다]"`를 둔다.

**마스터 수정 후 재검증**(자체 하네스, route.ts 축자 추출):

```
message 게터 throw  -> [에러 요약 실패: 프로퍼티 접근이 예외를 던졌다]
name 게터 throw     -> [에러 요약 실패: 프로퍼티 접근이 예외를 던졌다]
cause 게터 throw    -> [에러 요약 실패: 프로퍼티 접근이 예외를 던졌다]
정상 Error          -> TypeError: fetch failed
시크릿 URL          -> req ?serviceKey=[REDACTED]&LAWD_CD=29170 failed
루프 밖으로 탈출한 케이스 수: 0 (PASS)
```

→ 정상 진단정보와 시크릿 마스킹 둘 다 훼손 없음. `tsc`/`lint` exit 0 재확인.

### F-1 (Low, 이월) 마스킹 정규식의 **미도달** 우회 4건

`serviceKey = <값>`(등호 주변 공백) · `serviceKey%3D<값>`(인코딩 등호) · `{"serviceKey":"<값>"}`(콜론/JSON) · 시크릿이 `Error.name`에 들어간 경우 → 시크릿이 통과한다.

**도달성: 현재 저장소 코드에서 4건 모두 도달 불가.** 유일한 `serviceKey` 생산자는 `lib/molit-api.ts:158-164`의 `` `?serviceKey=${getApiKey()}` ``로 공백·인코딩 없는 `=` 형태이고, 4번 분기가 정체불명 객체를 `JSON.stringify`하지 않아 JSON 경로가 차단되며, `Error.name`을 시크릿으로 설정하는 코드도 없다. 권고: 정규식을 `[=:]\s*`·`%3D`까지 받도록 넓히거나 **주석의 방어 범위 주장을 실제에 맞게 좁혀라**(현재 주석은 실제보다 넓게 주장한다).

### F-2 (Low, 이월) `key`/`Bearer` 단독 alternative의 과잉 마스킹

`monkey=banana` → `monkey=[REDACTED]`, `sortkey=a cacheKey=b` → 둘 다 마스킹, `Bearer token expired` → `Bearer [REDACTED] expired`. 단어 경계가 없어서다. **도달성**: `grep -rn "key=" --include=*.ts app lib scripts` → `serviceKey=` 외 매칭 0건. 우리 코드가 만드는 문자열에서는 발생하지 않고 외부 라이브러리 메시지에서만 가능. 권고: `(?<![\w])key=` 경계 추가.

### F-3 (Low, 사문) early-return 응답 모양이 "정상 경로와 일치"하지 않는다

주석은 "정상 경로와 응답 모양을 맞춰"라고 적었으나 실제로는 `nextIndex`·`elapsedMs`가 여전히 빠져 있다. 주석이 근거로 든 논리("undefined와 값 두 표현이 섞이면 모니터링이 갈라진다")가 이 두 필드에도 적용되는데 닫히지 않았다. HEAD에도 없던 필드라 회귀는 아니고, `buildRegionList()`가 항상 114를 반환하므로 이 분기 자체가 **사문(dead code)** 이다. 주석 주장을 좁히거나 두 필드를 채우는 것 중 하나.

## QA가 확인하지 못한 것 (정직한 구분)

1. **라이브 호출 미실시** — 실제 배포본 응답·`elapsedMs`·504 미발생·실제 `failed[]` 내용은 마스터 몫.
2. **광주 북구·광산구·울산 중구가 왜 throw했는지 여전히 모른다.** 다만 코드 경로 추적으로 후보를 좁혔다 — 🔎 **`prewarmRegion` 내부에서 try로 감싸이지 않은 유일한 실질 호출은 `route.ts:363`의 `dedupeMonthData(...)`** 하나다(`getCacheStatus`·`loadMonthlyStatsCells`·`collectMonth`·`upsertMonthDeals`·`upsertCacheStatus`·`loadMonthFromDb`·`upsertMonthlyStats` 전부 개별 try 안). `lib/kst.ts`의 `toKstDateString`은 파싱 불가 입력에도 `""`를 반환하고 throw하지 않음을 실측 확인, `getKstYm`은 0~12 리터럴만 받아 RangeError 도달 불가. → **다음 실행의 `failed[].error`는 `dedupeMonthData` 계열(`RangeError`/`TypeError`)일 가능성이 높다.** 만약 `[비Error 예외: object]`로만 찍히면 원인을 못 주므로 F-1/F-4와 함께 재검토가 필요하다.
3. `console.error`가 Vercel 로그에 남기는 스택의 시크릿 포함 여부는 범위 밖(원래부터 있던 상태이며 이 수정으로 변하지 않았다).
4. 동결/타 QA 담당 6파일은 읽기만 했고 검증하지 않았다.
5. 화면 확인 해당 없음(크론 JSON API, UI 없음).
