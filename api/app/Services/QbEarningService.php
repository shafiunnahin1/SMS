<?php

namespace App\Services;

use App\Models\{PlatformSetting, QbConcept, QbQuestion, QbQuiz, QbQuizQuestion, QbResource, QbWriterEarning, QbWriterWallet, QbWriterWalletTxn, User};
use App\Support\{Catalogue, Money};
use Illuminate\Support\Facades\DB;

// QB.10b (D66, docs/modules/question-bank.md §৪.৫): the writer's share of every sale, booked INSIDE the sale's own DB transaction
// (the caller's) - an institution's purchase (QbPurchaseService), a student's unlock or a quiz package (QbStudentController::unlock).
// The share is platform_settings.qb_writer_share_percent (0 when the Super Admin has not set it); the writer is the item's author
// when that user is a content_writer (the Super Admin's own items earn nobody). A quiz package's share is split among the writers of
// its quizzes' fixed questions by question count, largest remainder first, so the parts add up to the share exactly. Every sale writes
// an earning row (amount 0 for a free item - it still counts as a sale); a wallet txn only when the amount is above 0. The writers'
// rows are platform rows, written through the named exit Catalogue::asPlatform() (the sale runs on the institution's host).
class QbEarningService
{
    public const SHARE_KEY = 'qb_writer_share_percent';
    public const MIN_KEY = 'qb_writer_min_withdrawal';

    public static function sharePercent(): string
    {
        return Money::format(Money::toPaisa((string) (PlatformSetting::read(self::SHARE_KEY) ?? '0')));
    }

    /** @param string $source institution_unlock | student_unlock | quiz_package */
    public function credit(string $source, int $sourceId, string $itemType, int $itemId, string $saleAmount): void
    {
        Catalogue::asPlatform(function () use ($source, $sourceId, $itemType, $itemId, $saleAmount) {
            DB::transaction(function () use ($source, $sourceId, $itemType, $itemId, $saleAmount) {
                $sale = Money::toPaisa($saleAmount);
                $percent = self::sharePercent();
                $share = intdiv($sale * Money::toPaisa($percent) * 2 + 10000, 20000);           // sale × percent / 100, half up, in paisa
                foreach ($this->split($itemType, $itemId, $share) as $writerId => $amount) {
                    QbWriterEarning::create(['writer_user_id' => $writerId, 'source' => $source, 'source_id' => $sourceId, 'item_type' => $itemType, 'item_id' => $itemId,
                        'sale_amount' => Money::format($sale), 'share_percent' => $percent, 'amount' => Money::format($amount)]);
                    if ($amount > 0) $this->move($writerId, 'earning', $amount, "{$source}:{$sourceId}", null);
                }
            });
        });
    }

    /** Adds (or takes, when negative) paisa on the writer's balance with a ledger row; the wallet row is locked first. */
    public function move(int $writerId, string $type, int $amount, ?string $reference, ?int $by): QbWriterWallet
    {
        $wallet = QbWriterWallet::where('writer_user_id', $writerId)->lockForUpdate()->first()
            ?? QbWriterWallet::create(['writer_user_id' => $writerId, 'balance' => '0.00', 'held' => '0.00']);
        $balance = Money::toPaisa((string) $wallet->balance) + $amount;
        $wallet->update(['balance' => Money::format($balance)]);
        QbWriterWalletTxn::create(['writer_user_id' => $writerId, 'type' => $type, 'amount' => Money::format($amount), 'balance_after' => Money::format($balance),
            'reference' => $reference, 'created_by' => $by]);
        return $wallet;
    }

    /** [writer id => paisa] */
    private function split(string $itemType, int $itemId, int $share): array
    {
        if ($itemType !== 'quiz_package') {
            $model = ['question' => QbQuestion::class, 'concept' => QbConcept::class, 'resource' => QbResource::class][$itemType] ?? null;
            $author = $model ? $model::whereKey($itemId)->value('created_by') : null;
            return $author && $this->isWriter((int) $author) ? [(int) $author => $share] : [];
        }
        $questionIds = QbQuizQuestion::whereIn('qb_quiz_id', QbQuiz::where('qb_quiz_package_id', $itemId)->pluck('id'))->pluck('qb_question_id')->unique();
        $counts = QbQuestion::whereIn('id', $questionIds)->pluck('created_by')->filter(fn ($w) => $w && $this->isWriter((int) $w))
            ->countBy()->sortKeys()->all();
        $n = array_sum($counts);
        if ($n === 0) return [];
        $parts = [];
        $rest = [];
        foreach ($counts as $w => $c) { $parts[$w] = intdiv($share * $c, $n); $rest[$w] = ($share * $c) % $n; }
        arsort($rest);
        foreach (array_slice(array_keys($rest), 0, $share - array_sum($parts)) as $w) $parts[$w]++;
        return $parts;
    }

    private function isWriter(int $userId): bool
    {
        return User::platform()->whereKey($userId)->where('role', 'content_writer')->exists();
    }
}
