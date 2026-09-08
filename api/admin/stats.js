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
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const results = await Promise.all([
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('chat_logs').select('*', { count: 'exact', head: true }),
      supabase.from('documents').select('*', { count: 'exact', head: true }),
      supabase.from('chat_logs').select('session_id').limit(5000),
      supabase.from('documents').select('source').limit(5000),
    ]);

    // Supabase 쿼리는 네트워크·DB 오류가 나도 예외를 던지지 않고 { error }를 담아 정상 반환하므로,
    // 여기서 명시적으로 확인하지 않으면 실제 장애 상황이 "데이터 0건"으로 조용히 둔갑합니다.
    const failed = results.find((r) => r.error);
    if (failed) {
      console.error('admin stats: supabase query failed', failed.error);
      res.status(502).json({ error: 'database unreachable', detail: failed.error.message });
      return;
    }

    const [totalLeadsRes, leadsLast7Res, totalChatLogsRes, totalDocChunksRes, sessionRowsRes, sourceRowsRes] = results;

    const totalSessions = new Set((sessionRowsRes.data || []).map((r) => r.session_id)).size;
    const totalDocSources = new Set((sourceRowsRes.data || []).map((r) => r.source)).size;

    res.status(200).json({
      totalLeads: totalLeadsRes.count || 0,
      leadsLast7Days: leadsLast7Res.count || 0,
      totalChatLogs: totalChatLogsRes.count || 0,
      totalSessions,
      totalDocChunks: totalDocChunksRes.count || 0,
      totalDocSources,
    });
  } catch (err) {
    console.error('admin stats error', err);
    res.status(500).json({ error: 'internal error' });
  }
};
