// docs/*.md 를 청크 분할 → 임베딩 → Supabase documents 테이블에 적재하는 1회성 스크립트.
// 실행: npm run ingest  (사전에 .env 파일에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY 필요)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { ingestDocument } = require('../lib/ingest-core');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error('환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY 가 필요합니다.');
  console.error('.env.example을 .env로 복사한 뒤 값을 채우고: node --env-file=.env scripts/ingest.js');
  process.exit(1);
}

const DOCS_DIR = path.join(__dirname, '..', 'docs');

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`${DOCS_DIR} 폴더가 없습니다.`);
    process.exit(1);
  }
  const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'));
  if (!files.length) {
    console.error(`${DOCS_DIR} 안에 .md 파일이 없습니다.`);
    process.exit(1);
  }

  for (const filename of files) {
    const fullPath = path.join(DOCS_DIR, filename);
    const text = fs.readFileSync(fullPath, 'utf8');
    const result = await ingestDocument({ supabase, openai, filename, text });
    console.log(`[${filename}] ${result.total}개 청크 중 ${result.ok}개 저장 완료`);
    result.errors.forEach((e) => console.error(`  - ${e}`));
  }

  console.log('인제스트 완료.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
