const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function clean(value, maxLen) {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('lead api: missing env vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const body = req.body || {};
  const name = clean(body.contact_name || body.name, 200);
  const phone = clean(body.phone, 50);
  const email = clean(body.email, 200);
  const company = clean(body.company, 200);

  if (!name || !phone || !email) {
    res.status(400).json({ error: 'name, phone, email are required' });
    return;
  }

  // leads 테이블에는 없는 항목(직급, 사업지, 사업 단계, 관심 서비스, 상담 방식, 자유 문의)은
  // message 컬럼에 사람이 읽기 좋은 형태로 함께 정리해서 저장합니다.
  const extraLines = [];
  const title = clean(body.title, 100);
  const site = clean(body.site, 200);
  const stage = clean(body.stage, 100);
  const channel = clean(body.channel, 50);
  const freeMessage = clean(body.message, 3000);
  const interest = Array.isArray(body.interest) ? body.interest.filter((v) => typeof v === 'string') : [];

  if (title) extraLines.push(`직급/부서: ${title}`);
  if (site) extraLines.push(`사업지/현장명: ${site}`);
  if (stage) extraLines.push(`사업 단계: ${stage}`);
  if (interest.length) extraLines.push(`관심 서비스: ${interest.join(', ')}`);
  if (channel) extraLines.push(`상담 희망 방식: ${channel}`);
  if (freeMessage) extraLines.push(`문의 내용: ${freeMessage}`);

  const message = extraLines.join('\n').slice(0, 4000);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase.from('leads').insert([{ name, phone, email, company, message }]);

  if (error) {
    console.error('lead insert error', error);
    res.status(500).json({ error: 'failed to save lead' });
    return;
  }

  res.status(200).json({ ok: true });
};
