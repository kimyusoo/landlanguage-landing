// docs 임베딩(scripts/ingest.js)과 admin 업로드(api/admin/upload.js)가 공유하는 청크 분할 로직.

const MAX_CHUNK_LEN = 1200;
const OVERLAP_LEN = 150;

// faq.md는 "**Qn. ...**" 단위(질문 하나 = 청크 하나)로 분할해 검색 정확도를 높입니다.
function splitFaq(text) {
  const blocks = text.split(/\n(?=\*\*Q[^\n]*\*\*)/g);
  return blocks.map((b) => b.trim()).filter((b) => /^\*\*Q/.test(b));
}

// 일반 문서는 ## / ### 헤딩 단위로 나누고, 너무 길면 문단 단위로 다시 쪼갭니다.
// 헤딩이 없는 문서(PDF에서 뽑은 텍스트 등)는 전체가 하나의 섹션으로 취급되어
// 길이 기준 문단 분할로 자연스럽게 넘어갑니다.
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
  return /faq\.md$/i.test(filename) ? splitFaq(text) : splitByHeadings(text);
}

module.exports = { splitFaq, splitByHeadings, chunkFile, MAX_CHUNK_LEN, OVERLAP_LEN };
