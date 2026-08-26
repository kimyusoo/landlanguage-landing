const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const { checkAdminAuth } = require('../../lib/admin-auth');
const { ingestDocument } = require('../../lib/ingest-core');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const ALLOWED_EXT = ['pdf', 'md', 'txt'];
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 원본 파일 기준 3MB (base64 전송 + Vercel 요청 본문 한도 고려)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  if (!checkAdminAuth(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const body = req.body || {};
  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';

  if (!filename || !fileBase64) {
    res.status(400).json({ error: 'filename과 fileBase64가 필요합니다' });
    return;
  }

  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    res.status(400).json({ error: 'PDF, MD, TXT 파일만 지원합니다' });
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(fileBase64, 'base64');
  } catch (e) {
    res.status(400).json({ error: '파일 데이터를 읽지 못했습니다' });
    return;
  }
  if (!buffer.length) {
    res.status(400).json({ error: '빈 파일입니다' });
    return;
  }
  if (buffer.length > MAX_FILE_BYTES) {
    res.status(400).json({ error: `파일이 너무 큽니다 (최대 ${Math.floor(MAX_FILE_BYTES / 1024 / 1024)}MB)` });
    return;
  }

  let text = '';
  try {
    if (ext === 'pdf') {
      const { getDocumentProxy, extractText } = require('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const extracted = await extractText(pdf, { mergePages: true });
      text = extracted.text || '';
    } else {
      text = buffer.toString('utf8');
    }
  } catch (err) {
    console.error('admin upload parse error', err);
    res.status(400).json({ error: '파일 내용을 읽지 못했습니다: ' + err.message });
    return;
  }

  text = text.trim();
  if (!text) {
    res.status(400).json({ error: '파일에서 텍스트를 추출하지 못했습니다' });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const result = await ingestDocument({ supabase, openai, filename, text });
    res.status(200).json({ ok: true, filename, chunks: result.total, saved: result.ok, errors: result.errors });
  } catch (err) {
    console.error('admin upload ingest error', err);
    res.status(500).json({ error: 'ingest failed' });
  }
};
