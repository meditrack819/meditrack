// routes/debug.js
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = (url && service) ? createClient(url, service) : null;

router.get('/auth-ping', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, reason: 'supabaseAdmin not configured', url, service_present: !!service });
    }
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return res.status(500).json({ ok: false, error: error.message, url });
    res.json({ ok: true, url, users_seen: data?.users?.length ?? 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, url });
  }
});

// Create a throwaway user to prove it hits *this* project.
// Call e.g. GET /debug/auth-create?email=test123@example.com
router.get('/auth-create', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ ok: false, reason: 'supabaseAdmin not configured', url });
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ ok: false, error: 'email required as query param' });

    const password = 'TestPass1234';
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { created_by: 'debug' },
    });
    if (error) return res.status(500).json({ ok: false, error: error.message, url });
    res.json({ ok: true, created_user_id: data.user?.id, url, login: { email, password } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message, url });
  }
});

module.exports = router;
