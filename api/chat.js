const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const EMBEDDING_MODEL = 'text-embedding-3-small'; // 1536차원 — documents.embedding과 동일
const CHAT_MODEL = process.env.LL_CHAT_MODEL || 'gpt-4o-mini';
const MATCH_COUNT = 4;
const SIMILARITY_THRESHOLD = 0.72; // 이 값 미만이면 "관련 문서 없음"으로 취급

const SYSTEM_PROMPT = `당신은 부동산마케팅 대행사 '랜드랭귀지'의 고객 상담 챗봇입니다. 다음 규칙을 반드시 지키세요.

1. 아래 [참고 문서]에 있는 내용만 근거로 답하세요. 참고 문서에 없거나 참고 문서가 비어 있으면 절대 지어내지 말고, "정확한 내용은 상담을 통해 확인해 드리겠습니다"라고 안내한 뒤 이 페이지의 '무료 상담 신청하기'를 이용하도록 권해주세요.
2. 랜드랭귀지의 서비스·계약·비용과 무관한 질문(날씨, 잡담, 다른 회사, 사적인 질문 등)에는 직접 답하지 말고, 정중하게 랜드랭귀지가 도와드릴 수 있는 주제로 대화를 유도하세요.
3. 법률적 판단이나 세무 판단(계약의 적법성 여부, 정확한 세금 액수 등)은 하지 마세요. 일반적인 안내 수준까지만 말하고, 반드시 전문가(변호사·세무사) 상담을 권하세요.
4. 친절한 상담원처럼 답하되 과장하거나 성과(계약률, 검색 순위 등)를 보장하는 표현은 쓰지 마세요.
5. 답변은 한국어로, 3~6문장 내외로 간결하게 작성하세요.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    console.error('chat api: missing env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY)');
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const body = req.body || {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId.slice(0, 200) : 'anonymous';

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  const question = message.slice(0, 2000);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  let reply;
  try {
    // 1) 질문 임베딩
    const embeddingRes = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: question,
    });
    const queryEmbedding = embeddingRes.data[0].embedding;

    // 2) 코사인 유사도 상위 문서 검색 (RLS 우회하는 service_role 키 사용)
    const { data: matches, error: matchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_count: MATCH_COUNT,
    });
    if (matchError) throw matchError;

    const relevant = (matches || []).filter((m) => typeof m.similarity === 'number' && m.similarity >= SIMILARITY_THRESHOLD);

    const context = relevant
      .map((m, i) => `[문서 ${i + 1} · 출처: ${m.source || '미상'}]\n${m.content}`)
      .join('\n\n');

    const userPrompt = context
      ? `[참고 문서]\n${context}\n\n[고객 질문]\n${question}`
      : `[참고 문서]\n(관련 문서를 찾지 못했습니다)\n\n[고객 질문]\n${question}`;

    // 3) 답변 생성
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    reply = completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content
      ? completion.choices[0].message.content.trim()
      : '죄송합니다, 지금은 답변을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  } catch (err) {
    console.error('chat api error', err);
    res.status(500).json({ error: 'internal error' });
    return;
  }

  // 4) 대화 로그 저장 — 실패해도 사용자 응답에는 영향을 주지 않음(best-effort)
  try {
    await supabase.from('chat_logs').insert([
      { session_id: sessionId, role: 'user', content: question },
      { session_id: sessionId, role: 'assistant', content: reply },
    ]);
  } catch (logErr) {
    console.error('chat_logs insert failed', logErr);
  }

  res.status(200).json({ reply });
};
