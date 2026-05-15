/**
 * SmartReceipt — automatic bank sync
 *
 * Fetches transactions from configured Israeli banks and upserts them into
 * Supabase so they appear in SmartReceipt automatically.
 *
 * Required env vars (set as GitHub Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID
 *
 * Optional bank credentials (add only the banks you use):
 *   HAPOALIM_USER_CODE, HAPOALIM_PASSWORD
 *   LEUMI_USERNAME, LEUMI_PASSWORD
 *   DISCOUNT_ID, DISCOUNT_PASSWORD, DISCOUNT_NUM
 *   MAX_USERNAME, MAX_PASSWORD
 *   MIZRAHI_USERNAME, MIZRAHI_PASSWORD
 *   YAHAV_USERNAME, YAHAV_PASSWORD, YAHAV_NATIONAL_ID
 *   BEINLEUMI_USERNAME, BEINLEUMI_PASSWORD
 */

import { createScraper } from 'israeli-bank-scrapers';
import { createClient }   from '@supabase/supabase-js';

// ── Supabase setup ────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // service role bypasses RLS
);
const USER_ID = process.env.SUPABASE_USER_ID;

if (!USER_ID) throw new Error('SUPABASE_USER_ID is required');

// ── Category classifier (mirrors src/utils/categoryClassifier.ts) ─────────────
const KEYWORD_MAP = {
  food:          ['coffee','cafe','restaurant','pizza','burger','sushi','mcdonalds','starbucks','kfc','subway','dominos','falafel','shawarma','hummus'],
  groceries:     ['supermarket','shufersal','mega','rami levy','victory','yochananof','osher ad','am:pm','tivtam','be\'er tov','milk','bread','grocery'],
  transport:     ['fuel','gas','petrol','parking','toll','bus','train','uber','gett','taxi','ten biscard','rav kav'],
  entertainment: ['movie','cinema','concert','netflix','spotify','hulu','disney','game','museum','zoo','sport'],
  health:        ['pharmacy','super-pharm','be health','clinic','doctor','hospital','dental','gym','fitness','vitamin'],
  shopping:      ['zara','h&m','castro','renuar','golf','terminal x','amazon','ebay','ikea','ace','home center'],
  utilities:     ['electric','electricity','hot','partner','cellcom','012','bezeq','arnona','water','insurance','rent','mortgage'],
};

function classifyCategory(description) {
  const lower = description.toLowerCase();
  for (const [cat, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return 'other';
}

// ── Bank definitions ──────────────────────────────────────────────────────────
const BANKS = [
  {
    id: 'hapoalim',
    name: 'Bank Hapoalim',
    enabled: !!(process.env.HAPOALIM_USER_CODE && process.env.HAPOALIM_PASSWORD),
    credentials: () => ({
      userCode: process.env.HAPOALIM_USER_CODE,
      password: process.env.HAPOALIM_PASSWORD,
    }),
  },
  {
    id: 'leumi',
    name: 'Bank Leumi',
    enabled: !!(process.env.LEUMI_USERNAME && process.env.LEUMI_PASSWORD),
    credentials: () => ({
      username: process.env.LEUMI_USERNAME,
      password: process.env.LEUMI_PASSWORD,
    }),
  },
  {
    id: 'discount',
    name: 'Discount Bank',
    enabled: !!(process.env.DISCOUNT_ID && process.env.DISCOUNT_PASSWORD),
    credentials: () => ({
      id:       process.env.DISCOUNT_ID,
      password: process.env.DISCOUNT_PASSWORD,
      num:      process.env.DISCOUNT_NUM ?? '',
    }),
  },
  {
    id: 'max',
    name: 'Max / Leumi Card',
    enabled: !!(process.env.MAX_USERNAME && process.env.MAX_PASSWORD),
    credentials: () => ({
      username: process.env.MAX_USERNAME,
      password: process.env.MAX_PASSWORD,
    }),
  },
  {
    id: 'mizrahi',
    name: 'Mizrahi Tefahot',
    enabled: !!(process.env.MIZRAHI_USERNAME && process.env.MIZRAHI_PASSWORD),
    credentials: () => ({
      username: process.env.MIZRAHI_USERNAME,
      password: process.env.MIZRAHI_PASSWORD,
    }),
  },
  {
    id: 'yahav',
    name: 'Bank Yahav',
    enabled: !!(process.env.YAHAV_USERNAME && process.env.YAHAV_PASSWORD),
    credentials: () => ({
      username:   process.env.YAHAV_USERNAME,
      password:   process.env.YAHAV_PASSWORD,
      nationalID: process.env.YAHAV_NATIONAL_ID ?? '',
    }),
  },
  {
    id: 'beinleumi',
    name: 'First International (Beinleumi)',
    enabled: !!(process.env.BEINLEUMI_USERNAME && process.env.BEINLEUMI_PASSWORD),
    credentials: () => ({
      username: process.env.BEINLEUMI_USERNAME,
      password: process.env.BEINLEUMI_PASSWORD,
    }),
  },
];

// ── Sync one bank ─────────────────────────────────────────────────────────────
async function syncBank(bank) {
  console.log(`\n▶ ${bank.name}`);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // last 30 days

  const scraper = createScraper({
    companyId:           bank.id,
    startDate,
    combineInstallments: false,
    showBrowser:         false,
    args:                ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let result;
  try {
    result = await scraper.scrape(bank.credentials());
  } catch (err) {
    console.error(`  ✗ Scrape error: ${err.message}`);
    return { inserted: 0, skipped: 0, errors: 1 };
  }

  if (!result.success) {
    console.error(`  ✗ ${result.errorType}: ${result.errorMessage}`);
    return { inserted: 0, skipped: 0, errors: 1 };
  }

  let inserted = 0, skipped = 0;

  for (const account of result.accounts) {
    console.log(`  Account ${account.accountNumber}: ${account.txns.length} transactions`);

    for (const txn of account.txns) {
      // Only process expenses (negative amount = debit in some scrapers)
      const amount = Math.abs(txn.chargedAmount ?? txn.originalAmount ?? 0);
      if (amount <= 0) { skipped++; continue; }

      // Skip income (positive in scrapers that distinguish)
      if (txn.type === 'income' || (txn.chargedAmount > 0 && txn.type !== 'normal')) {
        skipped++;
        continue;
      }

      const externalId = `${bank.id}_${account.accountNumber}_${txn.identifier ?? txn.date + '_' + amount}`;
      const description = txn.description ?? txn.memo ?? 'Bank transaction';
      const date  = new Date(txn.date).toISOString();
      const cat   = classifyCategory(description);

      const item = {
        id:       crypto.randomUUID(),
        name:     description,
        amount,
        category: cat,
        raw:      JSON.stringify(txn),
      };

      const row = {
        id:          crypto.randomUUID(),
        user_id:     USER_ID,
        date,
        store_name:  description,
        raw_text:    JSON.stringify(txn),
        items:       [item],
        total:       amount,
        notes:       null,
        external_id: externalId,
        source:      'bank-sync',
      };

      const { error } = await supabase
        .from('receipts')
        .upsert(row, { onConflict: 'user_id,external_id', ignoreDuplicates: true });

      if (error && !error.message.includes('duplicate')) {
        console.error(`  ✗ Insert error: ${error.message}`);
        skipped++;
      } else {
        inserted++;
      }
    }
  }

  console.log(`  ✓ inserted=${inserted} skipped=${skipped}`);
  return { inserted, skipped, errors: 0 };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const enabled = BANKS.filter((b) => b.enabled);

  if (enabled.length === 0) {
    console.log('No bank credentials configured. Add secrets and re-run.');
    process.exit(0);
  }

  console.log(`Syncing ${enabled.length} bank(s)…`);

  let totalInserted = 0, totalErrors = 0;
  for (const bank of enabled) {
    const { inserted, errors } = await syncBank(bank);
    totalInserted += inserted;
    totalErrors   += errors;
  }

  console.log(`\nDone. Total new transactions: ${totalInserted}, errors: ${totalErrors}`);
  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
