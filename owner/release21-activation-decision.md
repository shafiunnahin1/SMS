# Release 2.1 — activation planning decision draft

**Status: PROPOSED — owner approval ও পৃথক locked-decision commit বাকি।**

এটি [imported release proposal](../RELEASE-2.1.md) ও [integration record](../RELEASE-2.1-INTEGRATION.md)-এর activation প্রস্তুতির সিদ্ধান্ত। এটি implementation report নয়। নিচের placement ও permission মালিকের অনুমোদনের আগে কার্যকর হবে না।

## ১. প্রস্তাবিত placement ও নাম

- Release পরিচয় `R2.1` রাখা হবে, অর্থ **Exam Management Parity, Import and OMR**। সংখ্যাটি আগের milestone-এর মধ্যে retroactive insertion বোঝাবে না।
- Dependency order: বর্তমান **R3.3 → … → R3.A**, তারপর **R2.1.0 → … → R2.1.9**, তারপর আগের roadmap-এর R4 ও পরবর্তী milestones তাদের নিজস্ব dependency অনুযায়ী। R1.1/R2-এর আগে থেকে থাকা dependency বা acceptance এই সিদ্ধান্তে বদলাবে না।
- প্রথম executable task `R2.1.0` সরাসরি `R3.A` acceptance-এর উপর নির্ভর করবে। বর্তমান runtime release `R3` ও তার module list অপরিবর্তিত থাকবে; release-switch/activation acceptance পরিশোধিত plan-এ স্পষ্ট task হিসেবে সংজ্ঞায়িত হতে হবে।
- R3.A-এর আগে অনুমোদিত কাজ শুধু নিচের planning/intake reconciliation; feature implementation বা runtime release switch নয়। Owner এখনই R3 interrupt করতে চাইলে এই placement clause বদলে স্পষ্টভাবে অনুমোদন দিতে হবে; agent সেটি অনুমান করবে না।

## ২. এই সিদ্ধান্তে অনুমোদিত কাজ — planning checkpoint

Owner approval এবং পৃথক locked-decision commit-এর পরে agent:

1. Root imported draft ও provenance অক্ষত রেখে `docs/RELEASE-2.1.md`-এ reconciled protected specification প্রস্তুত করবে; roadmap/sequence ও relevant instruction entry points-এ অনুমোদিত placement প্রকাশ করবে। বর্তমান R3 status ও historical R1 banner-এর সম্পর্ক existing D79/D80 acceptance অনুযায়ী পরিষ্কার করবে।
2. Machine-readable scope ও generated task plan (`docs/release/r21-scope.json`, `docs/release/r21-plan.json`, `docs/AGENT-PLAN-R2.1.md`) প্রস্তুত করবে। Imported coarse tasks refine/split করতে হলে mapping ও dependency লিখবে; নতুন task IDs অনুমোদিত specification থেকে নির্ধারিত হবে, agent-এর অনুমানে নয়।
3. প্রতিটি task-এ exact scope, existing/new entities, routes, roles, dependencies, acceptance evidence ও commands লিখবে। Baseline/source inventory-এর অপূর্ণতাকে blocked রাখবে; draft-এর সংখ্যাগুলোকে measured result বলবে না।
4. Required plan-generation/verifier/guard support আপডেট করতে পারবে, শুধু অনুমোদিত release identity/order ও task dependencies প্রকাশ/enforce করার জন্য। বর্তমান guard শুধু R1/R3/FULL release switch জানে; R2.1 label যোগ করলেই activation অনুমোদিত হবে না। R3.A ও নতুন acceptance prerequisites enforce করতে হবে। Protected-file checks, existing release/module exactness, test expectations ও decision validation দুর্বল করা যাবে না; relevant guard self-tests ও verification লাগবে।
5. Source repositories read-only রেখে current routes/models/editor contracts ও existing School QB code-এর traceability reconciliation করবে। Source DB access, write-capable commands বা benchmark execution এই planning permission-এর অংশ নয়।

এই permission কোনো application/schema migration, নতুন endpoint/module/package, feature implementation, DB write, payment flow বা production activation অনুমোদন করে না। নির্দিষ্ট schema/API ও executable tasks owner-approved না হওয়া পর্যন্ত dependent implementation blocked থাকবে।

## ৩. অপরিবর্তনীয় integration boundaries

- Existing D65–D74 ও subsequent decisions, tenancy, roles, canonical exams/results, pricing, purchase services, financial append-only rules এবং safe rich-content contracts বহাল থাকবে। বর্তমান QB features পুনরায় duplicate implementation হবে না।
- Source `QuestionSet` = destination question paper (`qb_papers`); subset = paper set/variant; folder = paper organization। Source naming দিয়ে আলাদা reusable-question-set model অনুমোদিত নয়।
- Source personal wallet, student wallet, question-type subscription discount বা payment manager port করা হবে না। Unresolved balances/paid rights settlement-এর owner decision ছাড়া cutover নয়।
- TOON একটি proposed destination enhancement। Canonical format, parser/dependency choice, staged review/quick-edit, selected draft persistence, permissions ও acceptance পরিশোধিত task/spec-এ অনুমোদিত না হলে এর implementation সক্রিয় হবে না। Existing local TOON blocker এই draft দ্বারা resolved বলা হবে না।
- Source user/role mapping, visual editability/dataset ownership, Google/OCR dependencies, OMR baseline ও result mapping-এর অনির্ধারিত বিষয় plan-এ explicit blocker হবে। Secrets চাওয়া/প্রকাশ করা হবে না।
- Source draft-এর 32 diagram / 27 graph registry counts কিংবা import limits editable capability বা measured performance-এর প্রমাণ নয়। Current source anchor, fixture এবং observed result দিয়ে যাচাই করতে হবে; unresolved source contract গোপনে বাদ দেওয়া যাবে না।

## ৪. Planning checkpoint-এর Done When

- Approved placement/dependencies protected spec, scope, generated plan ও instruction links-এ একমত; runtime R3 এখনও অপরিবর্তিত।
- Imported tasks ও current QB backlog-এর overlap/gap map আছে; unknowns ও external inputs পৃথকভাবে blocked, কোনো feature `[x]` নয়।
- Plan freshness, relevant schema/reference consistency, existing query-plan check, guard self-tests যেখানে পরিবর্তন হয়েছে, full deep verifier ও staged guard পাস। Exact command/result ও affected files handoff/progress-এ থাকবে।
- Commit-এ অনুমোদিত decision-এর `Change-Request` trailer; fetch-এ remote unchanged, checkpoint commit/push ও local/remote equality verified। Source এবং আগে থেকে থাকা local user changes অক্ষত।

## ৫. Owner approval

**প্রস্তাবিত অনুমোদন:** উপরের `R2.1 after R3.A` placement এবং planning-only scope অনুমোদন করছি। Feature/runtime activation এই approval-এর অংশ নয়; পরিশোধিত executable task/schema/API scope approval-এর পরে এবং plan prerequisites সত্য হলে এগোবে।

Alternative placement চাইলে section ১ পরিবর্তন করতে হবে। Approval-এর পরে [guardrails §4](../docs/ops/agent-guardrails.md) অনুযায়ী পরবর্তী unused decision number দিয়ে `docs/LOCKED-DECISIONS.md`-এ পৃথক owner commit হবে। এই draft এখন কোনো decision number reserve করে না।
