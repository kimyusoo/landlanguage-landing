// 챗봇 대화 중 고객이 전화상담을 위해 성명·연락처를 남기면 감지해서
// leads 테이블에 자동 등록하는 로직 (api/chat.js에서 사용).

const PHONE_REGEX = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
  if (digits.length === 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  if (digits.length === 9) return digits.slice(0, 2) + '-' + digits.slice(2, 5) + '-' + digits.slice(5);
  return raw.trim();
}

// 메시지에서 전화번호 부분을 제외한 나머지 텍스트를 LLM에 넘겨 이름만 뽑아냅니다.
// 실패하거나 이름이 없으면 빈 문자열을 반환합니다(추측해서 지어내지 않음).
async function extractName(openai, model, message, rawPhoneMatch) {
  const withoutPhone = message.replace(rawPhoneMatch, ' ').trim();
  if (!withoutPhone) return '';
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '사용자 메시지에서 사람의 성명(이름)만 추출해 JSON으로만 반환하세요. 형식: {"name": "홍길동"}. 이름이라고 확신할 수 없으면 {"name": null}로 답하세요. 이름을 지어내지 마세요. 다른 설명은 절대 하지 마세요.',
        },
        { role: 'user', content: withoutPhone },
      ],
    });
    const parsed = JSON.parse(completion.choices[0].message.content || '{}');
    return typeof parsed.name === 'string' ? parsed.name.trim() : '';
  } catch (err) {
    console.error('extractName failed', err);
    return '';
  }
}

// 지금까지의 대화(chat_logs)를 불러와 상담한 고객의 관심사·문의 내용을 요약합니다.
async function summarizeConversation(openai, model, supabase, sessionId) {
  const { data } = await supabase
    .from('chat_logs')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(100);

  const turns = data || [];
  if (!turns.length) {
    return '(사전 대화 없이 전화상담만 요청함)';
  }

  const transcript = turns.map((t) => (t.role === 'user' ? '고객: ' : '챗봇: ') + t.content).join('\n').slice(0, 6000);

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '아래는 부동산마케팅 대행사 랜드랭귀지의 상담 챗봇 대화 기록입니다. 상담한 고객이 무엇을 궁금해했는지, 어떤 서비스에 관심을 보였는지를 중심으로 3~5문장의 한국어로 간결하게 요약하세요. 대화에 없는 내용을 지어내지 마세요.',
        },
        { role: 'user', content: transcript },
      ],
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error('summarizeConversation failed', err);
    return '(대화 요약 생성에 실패했습니다. 상담 이력은 관리자 페이지 대화기록 탭에서 확인해 주세요.)';
  }
}

module.exports = { PHONE_REGEX, normalizePhone, extractName, summarizeConversation };
