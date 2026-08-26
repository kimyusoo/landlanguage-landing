const { createClient } = require('@supabase/supabase-js');
const { checkAdminAuth } = require('../../lib/admin-auth');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (!checkAdminAuth(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('documents')
      .select('source, content, created_at')
      .limit(5000);

    if (error) {
      console.error('admin documents get error', error);
      res.status(500).json({ error: 'internal error' });
      return;
    }

    const bySource = new Map();
    for (const row of data || []) {
      const key = row.source || '(출처 없음)';
      if (!bySource.has(key)) {
        bySource.set(key, { source: key, chunkCount: 0, totalChars: 0, lastUpdated: row.created_at });
      }
      const entry = bySource.get(key);
      entry.chunkCount += 1;
      entry.totalChars += (row.content || '').length;
      if (new Date(row.created_at) > new Date(entry.lastUpdated)) entry.lastUpdated = row.created_at;
    }

    const sources = Array.from(bySource.values()).sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    res.status(200).json({ sources });
    return;
  }

  if (req.method === 'DELETE') {
    const source = typeof req.query.source === 'string' ? req.query.source : '';
    if (!source) {
      res.status(400).json({ error: 'source query param is required' });
      return;
    }
    const { error } = await supabase.from('documents').delete().eq('source', source);
    if (error) {
      console.error('admin documents delete error', error);
      res.status(500).json({ error: 'internal error' });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
};
