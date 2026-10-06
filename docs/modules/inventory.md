# Store / Inventory (Revision 11)

> প্রতিষ্ঠানের ভোগ্যপণ্য ও বিক্রয়যোগ্য সামগ্রী (বই, ইউনিফর্ম, স্টেশনারি, ল্যাব-সামগ্রী): স্টক, ইস্যু, বিক্রি, ক্ষতি, গণনা-সংশোধন। **স্থায়ী সম্পদ নয়** (সেটি প্রস্তাব P6)। সংখ্যাগুলো `infra/spec-verify/refs_r11.py`-এ যাচাইকৃত।
> Module key: `inventory` — **প্ল্যান-নিয়ন্ত্রিত** (ডিফল্টে Pro+); ধরন: school · college · coaching।

## ১. ডেটা
- `inventory_items`: `code` (`UNIQUE (institution_id, code)`), `name`, `unit`, `sale_price`, `avg_cost`, `reorder_level`, `stock`, `is_sellable`, `is_active`, `deleted_at`।
- `inventory_movements` — **একমাত্র সত্য (ledger)**: `type` (`receive|issue|sale|return|adjust|damage`), `qty` (সর্বদা ধনাত্মক), `direction` (+১/−১), `unit_amount`, `total_amount`, `balance_after`, ঐচ্ছিক `student_id` / `issued_to_*`, `supplier`, `receipt_no` (শুধু বিক্রি), `payment_method`।
- `inventory_items.stock` ও `avg_cost` **cache**; শুধু `InventoryService` লেখে (`$fillable`-এ নেই; D4-র নীতি)। যেকোনো সময় ledger থেকে পুনর্গণনাযোগ্য (`inventory:rebuild`)।
- **সম্পাদনা নয়:** movement কখনো বদলায়/মুছে না। ভুল হলে উল্টো movement (`adjust` বা `return`) — D32।

## ২. নিয়ম
1. **ঋণাত্মক স্টক নিষিদ্ধ:** `issue/sale/damage/adjust(−)` স্টকের বেশি হলে 422 `insufficient_stock` (রেস-নিরাপদ: `lockForUpdate` on item row, একই transaction-এ movement + cache)।
2. **খরচ-পদ্ধতি: moving average।** `receive` এ `avg = (পুরনো_স্টক × পুরনো_avg + নতুন_qty × ইউনিট-খরচ) ÷ নতুন_স্টক`। বেরোনো (sale/issue/damage) বর্তমান `avg` দামে; `avg` বদলায় না। `return` বর্তমান `avg` দামে ঢোকে। (FIFO নয় — সরলতার জন্য; পণ্য-মূল্য প্রায়ই বদলালে সীমা আছে, §৭।)
3. **বিক্রি (`sale`):** `receipt_no = STR-YYYY-nnnnn` (transaction + institution row lock; ফি-রসিদের সিকোয়েন্সের সাথে মিশে না, `UNIQUE (institution_id, receipt_no)`); `payment_method`; ছাত্র-সংযুক্ত হলে অভিভাবককে SMS ঐচ্ছিক। **এটি `fee_payments` নয়** — বকেয়া-হিসাবে প্রভাব নেই; ক্যাশবুক ও হিসাব-খাতায় যায় (`source = store`)।
4. **ইস্যু (`issue`):** টাকা ছাড়া অভ্যন্তরীণ বিতরণ (শিক্ষক/বিভাগ/ছাত্র); প্রাপক রেকর্ডে।
5. **ক্ষতি (`damage`):** কারণ বাধ্যতামূলক; ক্ষতির মূল্য = `qty × avg` (রিপোর্টে)।
6. **গণনা-সংশোধন (`adjust`):** বাস্তব গণনা ও সিস্টেম-স্টকের পার্থক্য; কারণ বাধ্যতামূলক; Admin বা Accountant। বড় পার্থক্যে (`inventory.adjust_review_percent`, ডিফল্ট ১০%) Admin অনুমোদন লাগে।
7. **Reorder:** `stock ≤ reorder_level` হলে ড্যাশবোর্ড সতর্কতা + দৈনিক scheduler-এ Admin-কে in-app নোটিফিকেশন।
8. **বিক্রি-বাতিল:** `return` movement (একই রসিদ উল্লেখ) + নগদ ফেরত হলে `fee_refunds`-এর মতো ক্যাশবুক-আউট; মূল বিক্রি অপরিবর্তিত।

## ৩. যাচাইকৃত উদাহরণ (golden — `StockLedgerTest`)
| ধাপ | স্টক | avg | নোট |
|---|---|---|---|
| receive ১০০ @ ৳৫০ | ১০০ | ৫০.০০ | |
| receive ৫০ @ ৳৫৬ | ১৫০ | **৫২.০০** | (১০০×৫০ + ৫০×৫৬) ÷ ১৫০ |
| sale ৩০ @ ৳৮০ | ১২০ | ৫২.০০ | খরচ ৳১,৫৬০; আয় ৳২,৪০০; মার্জিন **৳৮৪০** |
| issue ১০ | ১১০ | ৫২.০০ | |
| damage ৫ | ১০৫ | ৫২.০০ | ক্ষতি **৳২৬০** |
| adjust −২ (গণনা) | **১০৩** | ৫২.০০ | |
| sale ২০০ | — | — | **প্রত্যাখ্যাত** (স্টক ১০৩) |
| return ৫ | **১০৮** | ৫২.০০ | বর্তমান avg দামে |

## ৪. হিসাব-খাতা সংযোগ (যখন `accounting` চালু)
`receive` → Dr Inventory / Cr Cash-or-Payable; `sale` → Dr Cash / Cr Store Sales **এবং** Dr COGS / Cr Inventory (খরচ = `qty × avg`); `damage` → Dr Inventory Loss / Cr Inventory। `source = store`, `source_id = movement.id` (idempotent)। বিস্তারিত `docs/modules/accounting.md` §৪।

## ৫. Endpoint
```
GET|POST|PUT /inventory/items   DELETE /inventory/items/{id} (soft; ledger থাকলে শুধু নিষ্ক্রিয়)
GET  /inventory/items/{id}/ledger
POST /inventory/receive | issue | sale | damage | adjust | return        (প্রতিটি { item_id, qty, … })
GET  /inventory/stock?low=1          GET /inventory/reports/{stock|movements|sales|valuation}
GET  /inventory/sales/{receipt_no}/receipt.pdf
```
Roles: Admin, Accountant (store-keeper)। Teacher: নিজের নামে ইস্যু-অনুরোধ নয় (এই সংস্করণে নেই)। মেনু: ক্যাম্পাস → "স্টোর"।

## ৬. পরীক্ষা
| Test | Asserts |
|---|---|
| `StockLedgerTest` | §৩-এর পূর্ণ ক্রম; cache = ledger যোগফল; `inventory:rebuild` একই ফল |
| `StockConcurrencyTest` | দুই একসাথে বিক্রি শেষ ইউনিটের জন্য: একটি সফল, একটি 422; ঋণাত্মক স্টক অসম্ভব |
| `StoreReceiptTest` | `STR-` নম্বর অনন্য, ফি-রসিদ থেকে স্বাধীন; একসাথে ১০ বিক্রিতে ফাঁক/ডুপ্লিকেট নেই |
| `InventoryImmutabilityTest` | movement সম্পাদনা/মোছা 405/422; সংশোধন = উল্টো movement |
| `InventoryGateTest` | Basic প্ল্যানে 403 `feature_not_available`; private_batch-এ `module_disabled` |
| `InventoryTenancyTest` | অন্য প্রতিষ্ঠানের item 404; code প্রতিষ্ঠান-ভিত্তিক unique |

## ৭. সীমা
FIFO/batch-expiry নেই (ঔষধ/খাবার-ধরনের মেয়াদ-ট্র্যাকিং এই সংস্করণে নয়); একাধিক গুদাম নেই; বারকোড-স্ক্যান নেই (যোগযোগ্য: কোড-ক্ষেত্রে); কেনা-মূল্য ও সরবরাহকারী-খতিয়ান (P5) আলাদা প্রস্তাব।
