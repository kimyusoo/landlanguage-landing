const { createClient } = require('@supabase/supabase-js');
const { checkAdminAuth } = require('../../lib/admin-auth');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  if (!checkAdminAuth(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  // 최근 500건을 가져온 뒤 시간순으로 뒤집고, 세션 단위로 묶어서 반환합니다.
  const { data, error } = await supabase
    .from('chat_logs')
    .select('id, session_id, role, content, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error('admin chat-logs error', error);
    res.status(500).json({ error: 'internal error' });
    return;
  }

  const rows = (data || []).slice().reverse();
  const sessionsMap = new Map();
  for (const row of rows) {
    if (!sessionsMap.has(row.session_id)) {
      sessionsMap.set(row.session_id, { sessionId: row.session_id, messages: [], lastAt: row.created_at });
    }
    const session = sessionsMap.get(row.session_id);
    session.messages.push({ role: row.role, content: row.content, createdAt: row.created_at });
    session.lastAt = row.created_at;
  }

  const sessions = Array.from(sessionsMap.values()).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

  res.status(200).json({ sessions });
};
