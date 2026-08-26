// docs/*.md 를 청크 분할 → 임베딩 → Supabase documents 테이블에 적재하는 1회성 스크립트.
// 실행: npm run ingest  (사전에 .env 파일에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY 필요)

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error('환경변수 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY 가 필요합니다.');
  console.error('.env.example을 .env로 복사한 뒤 값을 채우고: node --env-file=.env scripts/ingest.js');
  process.exit(1);
}

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536차원
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const MAX_CHUNK_LEN = 1200;
const OVERLAP_LEN = 150;

// faq.md는 "**Qn. ...**" 단위(질문 하나 = 청크 하나)로 분할해 검색 정확도를 높입니다.
function splitFaq(text) {
  const blocks = text.split(/\n(?=\*\*Q[^\n]*\*\*)/g);
  return blocks
    .map((b) => b.trim())
    .filter((b) => /^\*\*Q/.test(b));
}

// 그 외 문서는 ## / ### 헤딩 단위로 나누고, 너무 길면 문단 단위로 다시 쪼갭니다.
function splitByHeadings(text) {
  const sections = text.split(/\n(?=##+ )/g).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  for (const section of sections) {
    if (section.length <= MAX_CHUNK_LEN) {
      chunks.push(section);
      continue;
    }
    const paragraphs = section.split(/\n\n+/);
    let buf = '';
    for (const p of paragraphs) {
      if (buf && (buf.length + p.length + 2) > MAX_CHUNK_LEN) {
        chunks.push(buf.trim());
        buf = buf.slice(-OVERLAP_LEN) + '\n\n' + p;
      } else {
        buf = buf ? buf + '\n\n' + p : p;
      }
    }
    if (buf.trim()) chunks.push(buf.trim());
  }
  return chunks;
}

function chunkFile(filename, text) {
  return filename === 'faq.md' ? splitFaq(text) : splitByHeadings(text);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    const chunks = chunkFile(filename, text);
    console.log(`[${filename}] ${chunks.length}개 청크로 분할`);

    // 재실행 시 중복 적재를 막기 위해 기존 source 데이터를 먼저 삭제합니다.
    const { error: delError } = await supabase.from('documents').delete().eq('source', filename);
    if (delError) console.error(`  기존 데이터 삭제 실패: ${delError.message}`);

    let ok = 0;
    for (const chunk of chunks) {
      try {
        const embeddingRes = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: chunk });
        const embedding = embeddingRes.data[0].embedding;
        const { error } = await supabase.from('documents').insert([{ source: filename, content: chunk, embedding }]);
        if (error) throw error;
        ok += 1;
      } catch (err) {
        console.error(`  청크 저장 실패: ${err.message}`);
      }
      await sleep(150); // API 레이트리밋 여유
    }
    console.log(`  -> ${ok}/${chunks.length}개 저장 완료`);
  }

  console.log('인제스트 완료.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
