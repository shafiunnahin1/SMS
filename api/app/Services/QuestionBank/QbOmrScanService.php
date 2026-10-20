<?php

namespace App\Services\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Resources\QbOmrScanResource;
use App\Models\{QbOmrForm, QbOmrScan, User};
use Illuminate\Support\Facades\{DB, Storage, Validator};
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Str;
use Throwable;

class QbOmrScanService
{
    public function __construct(private QbOmrFormService $forms, private QbOmrReviewService $review)
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
                'roll_uncertain' => ['sometimes', 'boolean'],        // D131: the roll/set digits are offered, a person confirms them
                'set_uncertain' => ['sometimes', 'boolean'],
                'answers' => ['required', 'array', 'size:' . $questionCount],
                'answers.*' => ['required', 'array'],
                'answers.*.selected' => ['present', 'array', 'max:' . $optionCount],
                'answers.*.selected.*' => ['integer', 'min:0', 'max:' . max(0, $optionCount - 1)],
                'answers.*.uncertain' => ['sometimes', 'boolean'],   // D131: the browser's two mark rules disagreed on this row
                'image' => ['required', 'image', 'max:10240'],
            ];
            if (is_array($scan) && is_array($scan['answers'] ?? null)) {   // multipart cannot send []: a missing or empty selection is a blank row
                foreach ($scan['answers'] as $k => $answer) {
                    if (!is_array($answer)) $answer = [];
                    if (!isset($answer['selected']) || $answer['selected'] === '') $answer['selected'] = [];
                    $scan['answers'][$k] = $answer;
                }
            }
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
                    'status' => filter_var($answer['uncertain'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 'uncertain'   // D131: a person checks it
                        : (count($selected) === 0 ? 'blank' : (count($selected) === 1 ? 'marked' : 'ambiguous')),
                    'selected' => $selected,
                ];
            }, $scan['answers']);
            $roll = $scan['roll'] ?? null;
            $setCode = $scan['set_code'] ?? null;
            $unresolvedQuestions = [];
            foreach ($answers as $answerIndex => $answer) {
                if ($answer['status'] !== 'marked') $unresolvedQuestions[] = $answerIndex + 1;
            }

            $imagePath = null;
            try {
                $image = $scan['image'];
                $directory = "institutions/{$paper->institution_id}/question-bank/omr/{$form->id}";
                $imagePath = Storage::disk('private')->putFileAs($directory, $image, Str::uuid() . '.' . $image->extension());
                $record = DB::transaction(function () use ($paper, $form, $setCode, $roll, $answers, $unresolvedQuestions, $imagePath, $scan) {
                    $record = new QbOmrScan([
                        'institution_id' => $paper->institution_id,
                        'qb_omr_form_id' => $form->id,
                        'layout_version' => $form->layout_version,
                        'set_code' => $setCode,
                        'roll' => $roll,
                        'answers_json' => $answers,
                        'answered_count' => count(array_filter($answers, fn ($answer) => $answer['status'] === 'marked')),
                        'status' => 'needs_review',
                        'comparison_json' => ['unresolved_question_numbers' => $unresolvedQuestions]
                            + array_filter(['roll_uncertain' => filter_var($scan['roll_uncertain'] ?? false, FILTER_VALIDATE_BOOLEAN), 'set_uncertain' => filter_var($scan['set_uncertain'] ?? false, FILTER_VALIDATE_BOOLEAN)]),
                        'image_path' => $imagePath,
                        'source' => $scan['source'],
                    ]);
                    $this->review->match($paper, $record);        // D127: the paper's program enrollment roll, this tenant only
                    $record->comparison_json = ['requires_manual_review' => true, 'reason_codes' => $this->review->reasons($form, $paper, $record)] + $record->comparison_json;
                    $record->save();
                    return $record;
                });
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