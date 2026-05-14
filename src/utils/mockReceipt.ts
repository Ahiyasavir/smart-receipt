// Mock receipt fixtures for testing the parser without scanning a real image.
// Each fixture simulates a different real-world condition.

// ─── Fixture 1: Clear, well-formatted supermarket receipt (baseline) ──────────
export const MOCK_RECEIPT_TEXT = `WALMART SUPERCENTER
123 Main Street
Anytown, ST 12345
Tel: (555) 123-4567

GROCERY RECEIPT
Date: 05/13/2026  Time: 14:32

Whole Milk 1gal          3.98
Bread Wheat Loaf         2.49
Eggs Large 12ct          4.99
Cheddar Cheese 8oz       5.49
Chicken Breast 2lb       8.99
Bananas 3lb              1.99
Ground Coffee 12oz       7.99
Orange Juice 64oz        4.49
Pasta Spaghetti 1lb      1.29
Tomato Sauce 24oz        1.99

SUBTOTAL                43.69
TAX 8.0%                 3.49
TOTAL                   47.18

Thank you for shopping!
Please come again.`;

// ─── Fixture 2: Receipt heavy with store abbreviations ────────────────────────
// Tests abbreviation expansion in nameNormalizer.
export const MOCK_ABBREV_RECEIPT = `KROGER #0472
456 Oak Avenue
Springfield, IL 62701

Date: 05/13/2026  Reg: 04

BNLS CHKN BRST 2LB      7.99 F
GV WHL MLK 1GAL          3.49 F
CHDR CHS 8OZ              4.99 F
ORG BROC CRWN            2.79 F
FRZN CORN 12OZ            1.49 F
SLMN FILT 6OZ             6.99 F
YGRT VNLA 6OZ             1.29 F
STRW PRSRV 18OZ           3.99 F
WW BRD LOAF               2.49 F
ORG GRND BF 1LB           8.49 F

SUBTOTAL                 43.90
TAX                       3.51
TOTAL                    47.41

Thank you`;

// ─── Fixture 3: Noisy receipt (tests exclusion filters) ──────────────────────
// Receipt with lots of metadata, loyalty noise, and financial lines that
// must NOT become items.
export const MOCK_NOISY_RECEIPT = `SAFEWAY
789 Elm Street, Portland OR 97201
Store #1042  Tel: (503) 555-9876
www.safeway.com

Cashier: Maria  Register: 03
Trans #: 20260513-114432
Date: 05/13/2026  Time: 11:44

*** SAFEWAY CLUB CARD SAVINGS ***
Member #: 123-456-789

Organic Apples 3lb       4.99 F
Greek Yogurt 32oz        5.49 F
Free Range Eggs 12ct     5.99 F
Baby Spinach 5oz         3.99 F
Sourdough Bread          3.49 F

Club Card Savings       -1.50
Digital Coupon          -0.50

SUBTOTAL                22.45
TAX 9.0%                 2.02
TOTAL                   24.47

VISA XXXX-1234          24.47
CHANGE                   0.00

You saved $2.00 today!
Survey: www.safeway.com/survey`;

// ─── Fixture 4: Two-line item format (tests name_only + price_only merging) ───
// Some receipt printers split long item names across two lines.
export const MOCK_TWOLINES_RECEIPT = `WHOLE FOODS MARKET
1 Main Plaza
Austin, TX 78701

365 Organic Whole Milk
  1 Gal                  5.99
Applegate Farms Turkey
  Breast Deli 7oz        6.49
Simple Truth Chicken
  Sausage 12oz           5.49
Organic Baby Arugula
  5oz Clamshell          3.99
Kind Bar Variety Pack
  12 Count               14.99

SUBTOTAL                36.95
TAX                      0.00
TOTAL                   36.95`;

// ─── Fixture 5: Distant/blurry simulation (OCR errors in item names) ──────────
// Simulates what Tesseract produces from a blurry or distant photo:
// garbled characters, merged words, dropped letters.
export const MOCK_BLURRY_RECEIPT = `WALM RT SUPERCNTR
Anyt wn, ST 1234

Wh0le Mlk 1gal          3.9B
Brd Wht Loaf             2.4Q
Eogs Larg 12ct           499
Chddr Chse Boz           5.49
Chckn Brst 21b           8.99
Bnnns 3lb                1.99
Grnd Coff 120z           7.99
OJ 640z                  4.49
Psta Spghtti             1.29
Tmto Suce 240z           1.99

SUBTOTAI               43.69
TAX 8.0%                3.49
TOTAL                  47.1B`;

// ─── Fixture 6: Category edge cases (tests category keyword matching) ─────────
// Items that should NOT become false positives for wrong categories,
// and items with unusual names that still need correct categories.
export const MOCK_CATEGORY_RECEIPT = `TARGET
100 Retail Blvd
Austin TX 78701

Date: 05/13/2026

Paper Towels 6pk         8.99
Dish Soap 25oz           3.49
Laundry Detergent 64oz   12.99
Shampoo 13.5oz           5.99
Conditioner 13.5oz       5.99
Pineapple Fresh          3.99
Watermelon Seedless      6.99
Avocado 4ct              3.99
Organic Garlic 3oz       1.99
Sparkling Water 12pk     7.99

SUBTOTAL                62.39
TAX                      5.60
TOTAL                   67.99`;
