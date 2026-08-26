# 랜드랭귀지 랜딩페이지 — 배포용 패키지

정적 랜딩페이지(`public/index.html` + `public/assets/`)에 **Supabase + OpenAI 기반 RAG 고객응대 챗봇**과 **상담 신청 폼 저장**이 붙어 있는 프로젝트입니다. Vercel의 Node 서버리스 함수(`api/*.js`)를 사용하므로 순수 정적 호스팅(GitHub Pages 등)으로는 챗봇/폼 저장 기능이 동작하지 않고 프론트엔드(디자인)만 보입니다. **Vercel 배포를 기준으로 합니다.**

## 구성

브라우저에 공개되는 파일은 전부 `public/` 안에만 둡니다. `public/` 바깥의 `api/`, `lib/`, `scripts/`, `docs/`, `package.json` 등은 Vercel이 정적 파일로 서빙하지 않으며(서버리스 함수 실행 시에만 내부적으로 사용), 요청 시 404를 반환합니다.

```
public/index.html   페이지 본체 (챗봇 스크립트 로드, 상담 폼 포함)
public/chatbot.js    우측 하단 RAG 챗봇 위젯 (프론트엔드)
public/admin.html/admin.js 관리자 페이지 — 비밀번호 게이트, 통계, 리드/대화기록/문서 탭, 파일 업로드
public/assets/       이미지 등 정적 리소스
api/chat.js         POST /api/chat        — 질문 임베딩 → Supabase 검색 → LLM 답변 생성 → chat_logs 저장
api/lead.js         POST /api/lead        — 상담 폼 제출 → leads 저장
api/admin/stats.js  GET  /api/admin/stats — 리드·대화·문서 통계
api/admin/leads.js  GET  /api/admin/leads — 최근 리드 200건
api/admin/chat-logs.js GET /api/admin/chat-logs — 최근 대화 500건(세션별로 묶어서 반환)
api/admin/documents.js GET/DELETE /api/admin/documents — 지식 문서 출처 목록 조회·삭제
api/admin/upload.js POST /api/admin/upload — PDF/MD/TXT 업로드 → 청크 분할 → 임베딩 → documents 적재
lib/chunk.js        청크 분할 로직 (scripts/ingest.js, api/admin/upload.js 공용)
lib/ingest-core.js  청크→임베딩→저장 파이프라인 (scripts/ingest.js, api/admin/upload.js 공용)
lib/admin-auth.js   관리자 비밀번호 검사 (x-admin-password 헤더 비교)
scripts/ingest.js   docs/*.md → 청크 분할 → 임베딩 → Supabase documents 적재 (수동 실행)
docs/               챗봇이 답변 근거로 삼는 원본 문서 (company-profile.md, service-policy.md, faq.md)
```

## 필수 환경변수 (서버 전용 — 절대 프론트엔드 코드에 넣지 않습니다)

`.env.example`을 참고하세요. **Vercel 대시보드 → 프로젝트 → Settings → Environment Variables**에 아래 3개를 등록해야 `/api/chat`, `/api/lead`가 동작합니다. 등록 전에는 두 API 모두 `500 server not configured`를 반환하도록 만들어져 있어 안전하게 실패합니다(에러 노출 없이 조용히 막힘).

| 이름 | 설명 |
| --- | --- |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role 키 (RLS 우회, **anon 키 아님**) |
| `OPENAI_API_KEY` | 임베딩(`text-embedding-3-small`)과 답변 생성(`gpt-4o-mini`)에 사용 |
| `ADMIN_PASSWORD` | (선택) `/admin.html` 게이트 비밀번호. 설정하지 않으면 실습용 기본값 `123456`이 적용됩니다. |

환경변수 등록/변경 후에는 Vercel에서 **재배포(Redeploy)**가 필요합니다.

## 관리자 페이지 (`/admin.html`)

비밀번호 게이트(기본 `123456`) 뒤에 통계 카드, 리드/대화기록/문서 3개 탭이 있습니다. 문서 탭에서 PDF·MD·TXT 파일을 드래그하거나 선택하면 서버가 자동으로 청크 분할 → 임베딩 → `documents` 테이블 적재까지 처리해, 별도로 `npm run ingest`를 돌리지 않아도 챗봇 지식 기반에 즉시 반영됩니다. 같은 파일명을 다시 올리면 기존 청크를 지우고 새로 저장합니다(교체).

**⚠️ 보안 관련 중요 주의사항**: 이 비밀번호 게이트는 **실습/데모 목적**입니다. 세션 관리, 비밀번호 해싱, 요청 횟수 제한(rate limit)이 전혀 없는 단순 평문 비교이며, `x-admin-password` 헤더는 브라우저 네트워크 탭에서 누구나 볼 수 있습니다. 실제 고객 데이터(`leads`, `chat_logs`)를 다루는 운영 환경에서는 반드시 Supabase Auth, Vercel의 Password Protection, 또는 별도 인증 시스템으로 교체한 뒤 사용하세요.

파일 업로드는 원본 파일 기준 최대 3MB(base64로 변환해 전송하며 Vercel 요청 본문 한도를 고려한 제한)까지 지원합니다.

## 문서 임베딩 적재 (최초 1회 + 문서 수정할 때마다)

```bash
npm install
cp .env.example .env   # 값 채우기
npm run ingest
```

`docs/` 안의 `.md` 파일을 읽어 청크로 나누고(`faq.md`는 질문 단위, 나머지는 헤딩 단위) OpenAI로 임베딩한 뒤 Supabase `documents` 테이블에 저장합니다. 같은 파일로 재실행하면 기존 데이터를 지우고 다시 넣어 중복되지 않습니다.

## 답변 규칙 (`api/chat.js`의 시스템 프롬프트로 구현)

- 검색된 문서(코사인 유사도 0.72 이상)만 근거로 답변하고, 없으면 지어내지 않고 상담 신청을 안내
- 서비스와 무관한 질문은 직접 답하지 않고 서비스 주제로 유도
- 법률·세무 판단은 하지 않고 전문가 상담을 권함
- 임계값(`SIMILARITY_THRESHOLD`)과 모델(`LL_CHAT_MODEL`)은 `api/chat.js` 상단에서 조정 가능

## 배포 방법

```bash
vercel --prod
```
또는 GitHub 저장소와 Vercel 프로젝트를 연결해두면 `main` 브랜치에 push할 때마다 자동 배포됩니다.

## 배포 전 반드시 확인할 것

1. 위 3개 환경변수를 Vercel에 등록했는지
2. `npm run ingest`로 문서 임베딩을 최소 1회 적재했는지 (안 하면 챗봇이 항상 "관련 문서를 찾지 못했습니다" 상태로 답변)
3. 실제로 챗봇에 질문을 던져보고, 상담 폼을 한 번 제출해서 Supabase Table Editor의 `chat_logs`/`leads`에 데이터가 쌓이는지 확인

## 원본(편집용) 프로젝트와의 차이

이 패키지는 `webde/` 폴더에 있던 Claude Design 캔버스 원본(`랜드랭귀지 랜딩페이지.dc.html`)을 일반 브라우저에서 바로 동작하는 순수 HTML/CSS/JS로 변환한 것입니다.

- `support.js`, `x-dc` 캔버스 런타임, React 의존성을 제거하고 동일한 디자인·문구·인터랙션(모바일 메뉴, FAQ 아코디언, 맨 위로 버튼, 폼 검증/완료 화면)을 순수 JS로 다시 구현했습니다.
- 실제로 페이지에서 쓰이는 이미지 10장만 `assets/`에 포함했습니다. 원본 폴더의 크롭 전 원본 이미지·업로드 원본(`uploads/chatgpt-img`)은 편집용 소스라 배포본에는 포함하지 않았습니다. 추가 수정이 필요하면 원본 캔버스 파일에서 다시 작업해 주세요.
- 캔버스 편집 전용 파일(`.thumbnail`, `support.js`)은 배포에 불필요해 제외했습니다.

## 확인된 사항

- 데스크톱(1280px)·모바일(375px) 두 뷰포트에서 렌더링, 반응형 전환(880px 기준), 이미지 10장 로드, FAQ 아코디언, 모바일 메뉴 열기/닫기, 개인정보 동의 시 제출 버튼 활성화, 폼 제출 후 완료 화면 전환을 모두 브라우저에서 직접 테스트해 정상 동작을 확인했습니다.
- `<title>`, meta description을 추가했습니다(원본 캔버스 파일에는 없었습니다).
