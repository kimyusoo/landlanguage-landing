const { createClient } = require('@supabase/supabase-js');
const { checkAdminAuth } = require('../../lib/admin-auth');
const { buildLeadsWorkbook } = require('../../lib/leads-export');

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
  const { data, error } = await supabase
    .from('leads')
    .select('name, phone, email, company, message, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('leads-export error', error);
    res.status(500).json({ error: 'internal error' });
    return;
  }

  const buffer = buildLeadsWorkbook(data);
  const filename = 'leads_' + new Date().toISOString().slice(0, 10) + '.xlsx';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(buffer);
};
