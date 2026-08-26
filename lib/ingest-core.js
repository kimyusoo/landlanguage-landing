// 문서 하나를 청크 분할 → 임베딩 → Supabase documents 적재까지 처리하는 공용 로직.
// scripts/ingest.js(초기 docs/*.md 일괄 적재)와 api/admin/upload.js(관리자 업로드)가 함께 씁니다.

const { chunkFile } = require('./chunk');

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536차원 — documents.embedding과 동일
const EMBED_DELAY_MS = 120; // OpenAI 레이트리밋 여유

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// source(파일명)가 같은 기존 청크는 지우고 새로 넣어 재업로드 시 중복되지 않게 합니다.
async function ingestDocument({ supabase, openai, filename, text }) {
  const chunks = chunkFile(filename, text).filter((c) => c && c.trim());
  if (!chunks.length) {
    return { total: 0, ok: 0, errors: ['텍스트에서 유효한 청크를 만들지 못했습니다'] };
  }

  const { error: delError } = await supabase.from('documents').delete().eq('source', filename);
  if (delError) {
    // 기존 데이터 삭제 실패는 치명적이지 않으므로(신규 파일이면 애초에 없음) 계속 진행합니다.
    console.error('ingestDocument: delete existing failed', delError.message);
  }

  let ok = 0;
  const errors = [];
  for (const chunk of chunks) {
    try {
      const embeddingRes = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: chunk });
      const embedding = embeddingRes.data[0].embedding;
      const { error } = await supabase.from('documents').insert([{ source: filename, content: chunk, embedding }]);
      if (error) throw error;
      ok += 1;
    } catch (err) {
      errors.push(err.message || String(err));
    }
    await sleep(EMBED_DELAY_MS);
  }

  return { total: chunks.length, ok, errors };
}

module.exports = { ingestDocument, EMBEDDING_MODEL };
