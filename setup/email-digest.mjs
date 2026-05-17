#!/usr/bin/env node
/**
 * Weekly Email Digest — sends spending summaries to opted-in users.
 *
 * Required environment variables:
 *   SUPABASE_URL              — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 *   RESEND_API_KEY            — Resend API key (resend.com, free tier)
 *
 * Run manually: node setup/email-digest.mjs
 * Triggered by: .github/workflows/email-digest.yml (every Monday 08:00 UTC)
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const SUPABASE_URL              = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY            = process.env.RESEND_API_KEY;
const FROM_EMAIL                = process.env.FROM_EMAIL ?? 'SmartReceipt <digest@smartreceipt.netlify.app>';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const resend   = new Resend(RESEND_API_KEY);

// ─── Date range ───────────────────────────────────────────────────────────────
const now       = new Date();
const weekStart = new Date(now);
weekStart.setDate(now.getDate() - 7);
weekStart.setHours(0, 0, 0, 0);

const prevWeekStart = new Date(now);
prevWeekStart.setDate(now.getDate() - 14);

// ─── Fetch opted-in users ────────────────────────────────────────────────────
const { data: budgetRows, error: budgetsErr } = await supabase
  .from('budgets')
  .select('user_id, monthly')
  .eq('email_digest', true);

if (budgetsErr) { console.error('budgets fetch:', budgetsErr.message); process.exit(1); }
if (!budgetRows?.length) { console.log('No opted-in users — nothing to send.'); process.exit(0); }

console.log(`Sending digest to ${budgetRows.length} user(s)…`);

// ─── Process each user ────────────────────────────────────────────────────────
for (const row of budgetRows) {
  const userId = row.user_id;

  // Get user email from auth
  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;
  if (!email) { console.warn(`No email for user ${userId}`); continue; }

  // Get this week's receipts
  const { data: receipts } = await supabase
    .from('receipts')
    .select('store_name, total, items, date')
    .eq('user_id', userId)
    .gte('date', weekStart.toISOString());

  if (!receipts?.length) { console.log(`${email}: no receipts this week — skipping`); continue; }

  // Get last week's total for comparison
  const { data: lastWeek } = await supabase
    .from('receipts')
    .select('total')
    .eq('user_id', userId)
    .gte('date', prevWeekStart.toISOString())
    .lt('date', weekStart.toISOString());

  const thisTotal  = receipts.reduce((s, r) => s + Number(r.total), 0);
  const lastTotal  = (lastWeek ?? []).reduce((s, r) => s + Number(r.total), 0);
  const diff       = thisTotal - lastTotal;
  const diffStr    = diff > 0 ? `▲ ${diff.toFixed(2)} more` : diff < 0 ? `▼ ${Math.abs(diff).toFixed(2)} less` : 'same';

  // Category breakdown
  const catMap = {};
  for (const r of receipts) {
    for (const item of (r.items ?? [])) {
      catMap[item.category] = (catMap[item.category] ?? 0) + item.amount;
    }
  }
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, total]) => `<li><strong>${cat}</strong>: $${Number(total).toFixed(2)}</li>`)
    .join('');

  // Top store
  const storeMap = {};
  for (const r of receipts) storeMap[r.store_name] = (storeMap[r.store_name] ?? 0) + 1;
  const topStore = Object.entries(storeMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  // Biggest receipt
  const biggest = receipts.reduce((m, r) => Number(r.total) > Number(m.total) ? r : m, receipts[0]);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1f2937; }
  .header { background: linear-gradient(135deg, #1e40af, #7c3aed); color: white; border-radius: 16px; padding: 24px; text-align: center; margin-bottom: 24px; }
  .header h1 { margin: 0; font-size: 28px; }
  .header p { margin: 4px 0 0; opacity: 0.75; }
  .card { background: #f9fafb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  .card h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
  .big { font-size: 32px; font-weight: 800; color: #1e40af; margin: 0; }
  .sub { font-size: 13px; color: #9ca3af; margin: 4px 0 0; }
  ul { margin: 0; padding: 0 0 0 16px; }
  li { margin: 4px 0; font-size: 14px; }
  .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 32px; }
  a { color: #3b82f6; }
</style></head>
<body>
  <div class="header">
    <div style="font-size:32px">🧾</div>
    <h1>$${thisTotal.toFixed(2)}</h1>
    <p>Your spending this week · ${diffStr} than last week</p>
  </div>

  <div class="card">
    <h3>Top Categories</h3>
    <ul>${topCats || '<li>No categorized items</li>'}</ul>
  </div>

  <div class="card" style="display:flex;gap:16px">
    <div style="flex:1">
      <h3>Favourite Store</h3>
      <p style="margin:0;font-weight:600">${topStore}</p>
    </div>
    <div style="flex:1">
      <h3>Biggest Purchase</h3>
      <p style="margin:0;font-weight:600">$${Number(biggest.total).toFixed(2)}</p>
      <p style="margin:2px 0 0;font-size:12px;color:#6b7280">${biggest.store_name}</p>
    </div>
  </div>

  <div class="card">
    <h3>Receipts this week</h3>
    <p class="big">${receipts.length}</p>
    <p class="sub">Open app to view details →</p>
  </div>

  <div class="footer">
    <a href="https://smartreceipt.netlify.app">Open SmartReceipt</a> ·
    <a href="https://smartreceipt.netlify.app">Unsubscribe</a>
  </div>
</body>
</html>`;

  const { error: sendErr } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      email,
    subject: `Your weekly spending: $${thisTotal.toFixed(2)} · SmartReceipt`,
    html,
  });

  if (sendErr) {
    console.error(`Failed to send to ${email}:`, sendErr.message);
  } else {
    console.log(`✓ Sent to ${email} ($${thisTotal.toFixed(2)})`);
  }
}

console.log('Email digest complete.');
