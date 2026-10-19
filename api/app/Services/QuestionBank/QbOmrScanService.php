<?php

namespace App\Services\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Resources\QbOmrScanResource;
use App\Models\{QbOmrForm, QbOmrScan, QbPaperVariant, User};
use Illuminate\Support\Facades\{DB, Storage, Validator};
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;
use Throwable;

class QbOmrScanService
{
    public function __construct(private QbOmrFormService $forms)
    {
    }

    public function storeBatch(User $actor, int $paperId, ?array $scans): array
    {
        $paper = $this->forms->paper($actor, $paperId);
        $form = QbOmrForm::where('qb_paper_id', $paper->id)->firstOrFail();
        if ($scans === null || $scans === []) {
            throw ValidationException::withMessages(['scans' => ['At least one scan is required.']]);
        }
        $settings = is_array($form->settings_json) ? $form->settings_json : [];
        if ($form->locked_at === null || !is_array($settings['geometry'] ?? null)) {
            throw new BusinessException(__('errors.qb_omr_not_generated'), 'qb_omr_not_generated', 422);
        }

        $questionCount = (int) ($settings['question_count'] ?? 0);
        $optionCount = (int) ($settings['option_count'] ?? 0);
        $variantCodes = QbPaperVariant::where('qb_paper_id', $paper->id)->pluck('code')->map(fn ($code) => (string) $code)->all();
        $results = [];
        $seenClientIds = [];
        $saved = 0;

        foreach (array_values($scans) as $index => $scan) {
            $clientId = is_array($scan) && is_string($scan['client_id'] ?? null) ? trim($scan['client_id']) : '';
            $rules = [
                'client_id' => ['required', 'string', 'max:64'],
                'source' => ['required', 'in:upload,camera'],
                'set_code' => ['nullable', 'string', 'max:10'],
                'roll' => ['nullable', 'string', 'max:12'],
                'answers' => ['required', 'array', 'size:' . $questionCount],
                'answers.*' => ['required', 'array'],
                'answers.*.selected' => ['present', 'array', 'max:' . $optionCount],
                'answers.*.selected.*' => ['integer', 'min:0', 'max:' . max(0, $optionCount - 1)],
                'image' => ['required', 'image', 'max:10240'],
            ];
            $validator = Validator::make(is_array($scan) ? $scan : [], $rules);

            if ($validator->fails()) {
                $results[] = $this->failed($clientId, $validator->errors()->messages());
                continue;
            }
            if (isset($seenClientIds[$clientId])) {
                $results[] = $this->failed($clientId, ['client_id' => ['Duplicate client_id in this batch.']]);
                continue;
            }
            $seenClientIds[$clientId] = true;

            $answers = array_map(function (array $answer): array {
                $selected = array_values(array_unique(array_map('intval', $answer['selected'])));
                sort($selected);
                return [
                    'status' => count($selected) === 0 ? 'blank' : (count($selected) === 1 ? 'marked' : 'ambiguous'),
                    'selected' => $selected,
                ];
            }, $scan['answers']);
            $roll = $scan['roll'] ?? null;
            $setCode = $scan['set_code'] ?? null;
            $duplicateRoll = filled($roll) && QbOmrScan::where('qb_omr_form_id', $form->id)->where('roll', $roll)->exists();
            $unresolvedQuestions = [];
            foreach ($answers as $answerIndex => $answer) {
                if ($answer['status'] !== 'marked') $unresolvedQuestions[] = $answerIndex + 1;
            }
            $reasons = ['student_match_required'];
            if (!preg_match('/^\d+$/', (string) $roll)) $reasons[] = 'roll_unreadable';
            if (!filled($setCode)) $reasons[] = 'set_code_missing';
            elseif (!in_array($setCode, $variantCodes, true)) $reasons[] = 'set_code_unknown';
            if ($unresolvedQuestions !== []) $reasons[] = 'answers_need_review';
            if ($duplicateRoll) $reasons[] = 'duplicate_roll';

            $imagePath = null;
            try {
                $image = $scan['image'];
                $directory = "institutions/{$paper->institution_id}/question-bank/omr/{$form->id}";
                $imagePath = Storage::disk('private')->putFileAs($directory, $image, Str::uuid() . '.' . $image->extension());
                $record = DB::transaction(fn () => QbOmrScan::create([
                    'institution_id' => $paper->institution_id,
                    'qb_omr_form_id' => $form->id,
                    'layout_version' => $form->layout_version,
                    'set_code' => $setCode,
                    'roll' => $roll,
                    'answers_json' => $answers,
                    'answered_count' => count(array_filter($answers, fn ($answer) => $answer['status'] === 'marked')),
                    'status' => 'needs_review',
                    'comparison_json' => [
                        'requires_manual_review' => true,
                        'reason_codes' => $reasons,
                        'unresolved_question_numbers' => $unresolvedQuestions,
                    ],
                    'image_path' => $imagePath,
                    'source' => $scan['source'],
                ]));
                $results[] = [
                    'client_id' => $clientId,
                    'status' => 'saved',
                    'scan' => (new QbOmrScanResource($record))->resolve(),
                ];
                $saved++;
            } catch (Throwable) {
                if ($imagePath) Storage::disk('private')->delete($imagePath);
                $results[] = $this->failed($clientId, ['scan' => ['Scan could not be saved.']]);
            }
        }

        $requested = count($scans);
        return [
            'summary' => ['requested' => $requested, 'saved' => $saved, 'failed' => $requested - $saved],
            'results' => $results,
        ];
    }

    private function failed(string $clientId, array $errors): array
    {
        return ['client_id' => $clientId, 'status' => 'failed', 'errors' => $errors];
    }
}