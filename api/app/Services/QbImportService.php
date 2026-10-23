<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Jobs\ParseQbImportBatch;
use App\Jobs\ParseQbImportChunk;
use App\Models\QbImportBatch;
use App\Models\QbImportRecord;
use App\Models\QbQuestion;
use App\Models\User;
use App\Support\Pdf\PdfQuestionSplitter;
use App\Support\Pdf\PdfTextExtractor;
use App\Support\Toon\ToonDecoder;
use App\Support\Toon\ToonException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

// D123 (R2.1.3): a JSON/TOON question import. The upload is stored and staged as a batch; queued chunks of 500 records
// decode, normalize and stage each record by its position (so a re-run never doubles one); counters say exactly how many are
// valid, invalid and possible duplicates. Nothing enters the question bank here - that is the reviewer's "import selected".
class QbImportService
{
    public const SCHEMA_V5 = 'exam-management.universal-content-json.v5';

    public function __construct(private QbImportNormalizer $normalizer, private QbQuestionWriter $writer) {}

    /**
     * @param list<array{name:string, bytes:string}> $files pasted text arrives as one file named "pasted.json" / "pasted.toon"
     */
    public function create(User $user, array $files, ?string $format = null, ?int $pageFrom = null, ?int $pageTo = null): array
    {
        if ($files === []) throw new BusinessException('nothing to import', 'qb_import_empty', 422);
        $max = (int) config('qb_import.max_files');
        if (count($files) > $max) throw new BusinessException("at most {$max} files", 'qb_import_too_many_files', 422, ['max' => $max]);
        $format ??= $this->format($files[0]['name'], $files[0]['bytes']);
        $list = array_map(fn ($f) => ['name' => mb_substr($f['name'], 0, 200), 'sha256' => hash('sha256', $f['bytes']), 'bytes' => strlen($f['bytes'])], $files);
        $source = hash('sha256', $format . '|' . implode('|', array_column($list, 'sha256')) . ($format === 'pdf' ? "|{$pageFrom}-{$pageTo}" : ''));

        $existing = QbImportBatch::where('created_by', $user->id)->where('source_sha256', $source)->where('status', '!=', 'failed')->latest('id')->first();
        if ($existing) return [$existing, false];                       // the same upload again: the batch already made from it

        $batch = QbImportBatch::create(['uuid' => (string) Str::uuid(), 'format' => $format, 'files' => $list, 'source_sha256' => $source,
            'status' => 'parsing', 'created_by' => $user->id] + ($format === 'pdf' ? ['page_from' => $pageFrom, 'page_to' => $pageTo] : []));
        foreach ($files as $i => $f) Storage::disk('private')->put($this->path($batch, $i), $f['bytes']);
        ParseQbImportBatch::dispatch($batch->id);
        return [$batch->fresh(), true];
    }

    /** the first job: read every file once, check the totals, then queue the chunks */
    public function plan(QbImportBatch $batch): void
    {
        $total = 0;
        $version = null;
        $chunks = [];
        try {
            if ($batch->format === 'pdf' && !$this->extractPdf($batch)) return;
            foreach ($batch->files as $i => $f) {
                [$records, $document, $v] = $this->read($batch, $i);
                $version ??= $v;
                $total += count($records);
                for ($o = 0; $o < count($records); $o += (int) config('qb_import.chunk')) $chunks[] = [$i, $o];
            }
            if ($total === 0) throw new BusinessException('no questions in the file', 'qb_import_empty', 422);
            if ($total > (int) config('qb_import.max_records')) throw new BusinessException('more than ' . config('qb_import.max_records') . ' questions in one import', 'qb_import_too_many', 422);
        } catch (BusinessException|ToonException|\JsonException|\RuntimeException $e) {
            $batch->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 500)]);
            return;
        }
        $batch->update(['total_records' => $total, 'schema_version' => $version]);
        foreach ($chunks as [$file, $offset]) ParseQbImportChunk::dispatch($batch->id, $file, $offset);
    }

    /** one chunk: normalize and stage records [offset, offset+chunk) of a file; a record already staged is left as it is */
    public function parseChunk(QbImportBatch $batch, int $fileIndex, int $offset): void
    {
        [$records, $document] = $this->read($batch, $fileIndex);
        $slice = array_slice($records, $offset, (int) config('qb_import.chunk'), true);
        $have = QbImportRecord::where('qb_import_batch_id', $batch->id)->where('file_index', $fileIndex)
            ->whereBetween('record_index', [$offset, $offset + count($slice) - 1])->pluck('record_index')->flip();
        $rows = [];
        foreach ($slice as $index => $raw) {
            if ($have->has($index)) continue;
            $n = is_array($raw) ? $this->normalizer->normalize($raw, $document)
                : ['payload' => [], 'errors' => [['path' => '', 'message' => 'a question must be an object']], 'warnings' => [], 'type_slug' => null, 'has_math' => false];
            if ($batch->format === 'pdf') $n = $this->pdfNotes($batch, is_array($raw) ? $raw : [], $n);
            $rows[$index] = $n + ['page_number' => is_array($raw) && is_int($raw['page_number'] ?? null) ? $raw['page_number'] : null];
        }
        $dupes = $this->duplicates($rows);
        DB::transaction(function () use ($batch, $fileIndex, $rows, $dupes) {
            foreach ($rows as $index => $n) {
                QbImportRecord::firstOrCreate(['qb_import_batch_id' => $batch->id, 'file_index' => $fileIndex, 'record_index' => $index], [
                    'page_number' => $n['page_number'], 'type_slug' => $n['type_slug'], 'payload' => $n['payload'], 'errors' => $n['errors'] ?: null, 'warnings' => $n['warnings'] ?: null,
                    'has_math' => $n['has_math'], 'duplicate_status' => isset($dupes[$index]) ? 'possible' : 'none', 'duplicate_question_id' => $dupes[$index] ?? null]);
            }
        });
        $this->recount($batch);
    }

    /** a batch whose chunks did not all finish (a worker died) queues the missing ones again */
    public function resume(QbImportBatch $batch): void
    {
        if ($batch->status === 'failed' || $batch->total_records === 0) { $batch->update(['status' => 'parsing', 'error' => null]); ParseQbImportBatch::dispatch($batch->id); return; }
        if ($batch->status !== 'parsing') return;
        $chunk = (int) config('qb_import.chunk');
        foreach ($batch->files as $i => $f) {
            [$records] = $this->read($batch, $i);
            for ($o = 0; $o < count($records); $o += $chunk) {
                $want = min($chunk, count($records) - $o);
                $got = QbImportRecord::where('qb_import_batch_id', $batch->id)->where('file_index', $i)->whereBetween('record_index', [$o, $o + $want - 1])->count();
                if ($got < $want) ParseQbImportChunk::dispatch($batch->id, $i, $o);
            }
        }
    }

    /** exact counters from the staged rows; the batch is ready when every record is staged */
    public function recount(QbImportBatch $batch): void
    {
        DB::transaction(function () use ($batch) {                      // chunks finish in parallel: one recount at a time
            $batch = QbImportBatch::lockForUpdate()->findOrFail($batch->id);
            $this->count($batch);
        });
        $batch->refresh();
    }

    private function count(QbImportBatch $batch): void
    {
        $q = QbImportRecord::where('qb_import_batch_id', $batch->id);
        $parsed = (clone $q)->count();
        $invalid = (clone $q)->whereNotNull('errors')->count();
        $batch->update(['parsed_records' => $parsed, 'invalid_records' => $invalid, 'valid_records' => $parsed - $invalid,
            'duplicate_records' => (clone $q)->where('duplicate_status', '!=', 'none')->count(),
            'imported_records' => (clone $q)->whereNotNull('qb_question_id')->count(),
            'status' => $batch->status === 'parsing' && $batch->total_records > 0 && $parsed >= $batch->total_records ? 'ready' : $batch->status]);
    }

    /** the fields a reviewer may change on a staged record (quick edit and bulk settings) */
    public const EDITABLE = ['type', 'question_text', 'answer_text', 'explanation_text', 'language', 'difficulty', 'marks', 'subject', 'chapter', 'topic',
        'class_levels', 'curriculum_node_ids', 'options', 'creative_parts', 'stimuli', 'items', 'occurrences'];

    /** quick edit / bulk settings: change the staged record only, then check it again exactly as on upload */
    public function edit(QbImportRecord $record, array $changes): QbImportRecord
    {
        if ($record->qb_question_id) throw new BusinessException('this record is already imported', 'qb_import_done', 422);
        $payload = $record->payload ?? [];
        $sourceIndexes = $payload['source_occurrence_indexes'] ?? [];
        unset($payload['source_occurrence_indexes']);
        if (array_key_exists('source_occurrence', $changes)) {
            $source = $changes['source_occurrence'];
            unset($changes['source_occurrence']);
            $occurrences = $payload['occurrences'] ?? [];
            $occurrences = is_array($occurrences) ? array_values($occurrences) : [];
            if (!is_array($source)) $source = [];
            $sourceFields = ['note', 'institution_name', 'board', 'exam_type', 'year', 'question_number', 'set_label', 'page_reference'];
            $source = array_intersect_key($source, array_flip($sourceFields));
            $existingIndex = collect($occurrences)->search(fn ($occurrence) => is_array($occurrence) && $this->occurrenceKey($occurrence) === $this->occurrenceKey($source));
            if ($existingIndex === false) {
                $sourceIndexes[] = count($occurrences);
                $occurrences[] = $source;
            } else {
                $sourceIndexes[] = $existingIndex;
            }
            $changes['occurrences'] = $occurrences;
        }
        $payload = array_merge($payload, array_intersect_key($changes, array_flip(self::EDITABLE)));
        if (array_key_exists('subject', $changes) && !array_key_exists('chapter', $changes)) unset($payload['chapter'], $payload['topic']);
        if (array_key_exists('chapter', $changes) && !array_key_exists('topic', $changes)) unset($payload['topic']);
        $n = $this->normalizer->normalize(array_filter($payload, fn ($v) => $v !== null), [], $sourceIndexes);
        $dupes = $this->duplicates([0 => $n]);
        $dupe = $dupes[0] ?? null;
        $status = $dupe === null ? 'none' : ($record->duplicate_question_id === $dupe && $record->duplicate_status !== 'none' ? $record->duplicate_status : 'possible');
        $record->update(['type_slug' => $n['type_slug'], 'payload' => $n['payload'], 'errors' => $n['errors'] ?: null, 'warnings' => $n['warnings'] ?: null,
            'has_math' => $n['has_math'], 'duplicate_status' => $status, 'duplicate_question_id' => $dupe, 'selected' => $record->selected && !$n['errors']]);
        return $record;
    }

    private function occurrenceKey(array $occurrence): string
    {
        $fields = ['note', 'institution_name', 'board', 'exam_type', 'year', 'question_number', 'set_label', 'page_reference'];
        $normalized = [];
        foreach ($fields as $field) {
            $value = $occurrence[$field] ?? null;
            $normalized[$field] = $field === 'year'
                ? ($value === null || $value === '' ? null : (int) $value)
                : (is_scalar($value) && trim((string) $value) !== '' ? trim((string) $value) : null);
        }
        return json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** D124: rejecting marks the record with a "rejected" error (so it can never be selected or imported); un-rejecting checks it again */
    public function reject(QbImportRecord $record, bool $rejected): void
    {
        if ($rejected) { $record->update(['errors' => [['path' => '', 'message' => self::REJECTED]], 'selected' => false]); return; }
        if (($record->errors[0]['message'] ?? null) === self::REJECTED) $this->edit($record, ['question_text' => $record->payload['question_text'] ?? '']);
    }

    public const REJECTED = 'rejected by the reviewer';

    /** Create or reuse the draft for exactly one valid staged record and open it in the canonical editor. */
    public function openEditorDraft(QbImportRecord $record, User $user): QbQuestion
    {
        try {
            $result = DB::transaction(function () use ($record, $user) {
                $locked = QbImportRecord::query()->lockForUpdate()->findOrFail($record->id);
                if ($locked->qb_question_id) return ['question' => QbQuestion::findOrFail($locked->qb_question_id)];
                if ($locked->errors) throw new BusinessException('only a valid staged question can open in the full editor', 'qb_import_invalid_record', 422);
                if ($locked->duplicate_status === 'possible') throw new BusinessException('resolve the possible duplicate before opening the full editor', 'qb_import_duplicate_unresolved', 422);
                if ($locked->duplicate_status === 'skip') throw new BusinessException('a skipped duplicate cannot open in the full editor', 'qb_import_duplicate_skipped', 422);

                $errors = [];
                $body = $this->normalizer->editorBody($locked->payload ?? [], function ($path, $message) use (&$errors) { $errors[] = ['path' => $path, 'message' => $message]; });
                if ($errors) return ['errors' => $errors];

                $in = $this->writer->placed($body);
                $question = QbQuestion::create(collect($in)->except(QbQuestionWriter::CHILDREN)->all()
                    + ['language' => $locked->payload['language'] ?? 'und', 'content_mode' => 'mixed', 'status' => 'draft', 'created_by' => $user->id]);
                $this->writer->children($question, $in, $user);
                $this->writer->revision($question, $user);
                $locked->update(['qb_question_id' => $question->id, 'selected' => false]);
                return ['question' => $question];
            }, 5);
        } catch (ValidationException $e) {
            $errors = collect($e->errors())->map(fn ($messages, $path) => ['path' => $path, 'message' => $messages[0] ?? 'invalid value'])->values()->all();
            $record->update(['errors' => $errors, 'selected' => false]);
            throw $e;
        }

        if (isset($result['errors'])) {
            $record->update(['errors' => $result['errors'], 'selected' => false]);
            $messages = [];
            foreach ($result['errors'] as $error) $messages[$error['path'] ?: 'question'][] = $error['message'];
            throw ValidationException::withMessages($messages);
        }
        return $result['question'];
    }

    public function sourceBytes(QbImportBatch $batch): string
    {
        return Storage::disk('private')->get($this->path($batch, 0)) ?? '';
    }

    /** "import selected": every selected, valid, not-yet-imported record whose duplicate question is resolved becomes a DRAFT of the
     *  importing writer, saved through the editor's own steps; each in its own transaction, so one failure never undoes another */
    public function finalize(QbImportBatch $batch, User $user): array
    {
        $result = ['imported' => 0, 'invalid' => 0, 'duplicate_unresolved' => 0, 'skipped' => 0, 'failed' => 0];
        QbImportRecord::where('qb_import_batch_id', $batch->id)->where('selected', true)->whereNull('qb_question_id')->orderBy('id')
            ->chunkById(200, function ($records) use ($user, &$result) {
                foreach ($records as $r) {
                    if ($r->errors) { $result['invalid']++; continue; }
                    if ($r->duplicate_status === 'possible') { $result['duplicate_unresolved']++; continue; }
                    if ($r->duplicate_status === 'skip') { $result['skipped']++; continue; }
                    $errors = [];
                    $body = $this->normalizer->editorBody($r->payload, function ($path, $message) use (&$errors) { $errors[] = ['path' => $path, 'message' => $message]; });
                    if ($errors) { $r->update(['errors' => $errors, 'selected' => false]); $result['invalid']++; continue; }
                    try {
                        DB::transaction(function () use ($r, $body, $user) {
                            $in = $this->writer->placed($body);
                            $q = QbQuestion::create(collect($in)->except(QbQuestionWriter::CHILDREN)->all()
                                + ['language' => $r->payload['language'] ?? 'und', 'content_mode' => 'mixed', 'status' => 'draft', 'created_by' => $user->id]);
                            $this->writer->children($q, $in, $user);
                            $this->writer->revision($q, $user);
                            $r->update(['qb_question_id' => $q->id, 'selected' => false]);
                        });
                        $result['imported']++;
                    } catch (ValidationException $e) {
                        $r->update(['errors' => collect($e->errors())->map(fn ($m, $path) => ['path' => $path, 'message' => $m[0]])->values()->all(), 'selected' => false]);
                        $result['failed']++;
                    }
                }
            });
        $this->recount($batch);
        return $result;
    }

    /** the error report: one line per problem - file, record number, field path, message */
    public function errorCsv(QbImportBatch $batch): string
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['file', 'record', 'type', 'path', 'message']);
        if ($batch->error) fputcsv($out, ['', '', '', '', $batch->error]);
        QbImportRecord::where('qb_import_batch_id', $batch->id)->whereNotNull('errors')->orderBy('file_index')->orderBy('record_index')
            ->chunk(500, function ($rows) use ($out, $batch) {
                foreach ($rows as $r) foreach ($r->errors as $e) fputcsv($out, [$batch->files[$r->file_index]['name'] ?? '', $r->record_index + 1, $r->type_slug, $e['path'], $e['message']]);
            });
        rewind($out);
        return "\xEF\xBB\xBF" . stream_get_contents($out);               // BOM: Excel opens Bangla correctly
    }

    /** a stored file -> [records, document, schema version]; the question list is `questions` or the root list */
    public function read(QbImportBatch $batch, int $fileIndex): array
    {
        if ($batch->format === 'pdf') {                                  // D124: the questions split from the PDF when it was read
            $records = json_decode(Storage::disk('private')->get($this->path($batch, $fileIndex) . '.records.json') ?? '[]', true) ?? [];
            return [$records, [], 'pdf'];
        }
        $bytes = Storage::disk('private')->get($this->path($batch, $fileIndex)) ?? '';
        $data = $batch->format === 'toon' ? ToonDecoder::decode($bytes) : json_decode(preg_replace('/^\xEF\xBB\xBF/', '', $bytes), true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($data)) throw new BusinessException('the file is not a question list', 'qb_import_shape', 422);
        if (array_is_list($data)) return [$data, [], self::SCHEMA_V5];
        if (!array_key_exists('questions', $data) || !is_array($data['questions'])) throw new BusinessException('the file has no "questions" list', 'qb_import_shape', 422);
        $version = is_string($data['schema_version'] ?? null) ? $data['schema_version'] : self::SCHEMA_V5;
        if (!str_starts_with($version, 'exam-management.universal-content-json.') && !str_starts_with($version, 'sms.question-import.')) {
            throw new BusinessException("unsupported schema_version \"{$version}\"", 'qb_import_version', 422);
        }
        return [array_values($data['questions']), is_array($data['document'] ?? null) ? $data['document'] : [], $version];
    }

    /** records whose normalized text matches an existing question of the same subject and type */
    private function duplicates(array $rows): array
    {
        $want = [];
        foreach ($rows as $index => $n) {
            if ($n['errors'] || !$n['payload']) continue;
            $body = $this->normalizer->editorBody($n['payload']);
            if (!$body['qb_subject_id'] || !$body['qb_question_type_id']) continue;
            $want[$body['qb_subject_id'] . ':' . $body['qb_question_type_id']][$index] = QbQuestionFinderService::normalize((string) $n['payload']['question_text']);
        }
        $found = [];
        foreach ($want as $pair => $texts) {
            [$subject, $type] = explode(':', $pair);
            $existing = [];
            QbQuestion::where('qb_subject_id', $subject)->where('qb_question_type_id', $type)->select(['id', 'question_text'])
                ->chunkById(2000, function ($qs) use (&$existing) { foreach ($qs as $q) $existing[QbQuestionFinderService::normalize((string) $q->question_text)] ??= $q->id; });
            foreach ($texts as $index => $t) if ($t !== '' && isset($existing[$t])) $found[$index] = $existing[$t];
        }
        return $found;
    }

    /** D124: read the PDF's pages once, keep the questions split from them next to the file; a PDF with no readable page stops here */
    private function extractPdf(QbImportBatch $batch): bool
    {
        $pdf = Storage::disk('private')->get($this->path($batch, 0)) ?? '';
        $read = (new PdfTextExtractor)->extract($pdf, $batch->page_from, $batch->page_to);
        if ($read['page_to'] - $read['page_from'] + 1 > (int) config('qb_import.max_pdf_pages')) {
            throw new BusinessException('more than ' . config('qb_import.max_pdf_pages') . ' pages in one import', 'qb_import_too_many_pages', 422, ['max' => config('qb_import.max_pdf_pages')]);
        }
        $records = (new PdfQuestionSplitter)->split($read['pages']);
        Storage::disk('private')->put($this->path($batch, 0) . '.records.json', json_encode($records, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $batch->update(['page_from' => $read['page_from'], 'page_to' => $read['page_to'], 'document_kind' => $read['document_kind'], 'unreadable_pages' => $read['unreadable_pages']]);
        if ($read['document_kind'] === 'scanned') {
            $batch->update(['status' => 'needs_ocr', 'error' => 'no page of this PDF has readable text (a scanned PDF): make a searchable PDF and upload it again']);
            return false;
        }
        return true;
    }

    /** D124: what the reviewer should know about a question from a PDF - its type was not clear, math or a legacy font on the page */
    private function pdfNotes(QbImportBatch $batch, array $raw, array $n): array
    {
        if (!isset($raw['question_type'])) $n['warnings'][] = 'the question type could not be told from the PDF - choose it';
        if (preg_match('/[√²³¹⁴π∫∑≤≥≠÷×∞θαβ°]/u', json_encode($raw, JSON_UNESCAPED_UNICODE))) { $n['has_math'] = true; $n['warnings'][] = 'math symbols in the PDF text - check and write them as LaTeX'; }
        if (!empty($raw['bijoy_converted'])) $n['warnings'][] = 'converted from Bijoy to Unicode - check the spelling';   // D125
        return $n;
    }

    private function format(string $name, string $bytes): string
    {
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if ($ext === 'pdf' || str_starts_with($bytes, '%PDF-')) return 'pdf';
        if ($ext === 'toon') return 'toon';
        if ($ext === 'json') return 'json';
        return in_array(ltrim($bytes, " \t\r\n\xEF\xBB\xBF")[0] ?? '', ['{', '['], true) ? 'json' : 'toon';
    }

    private function path(QbImportBatch $batch, int $i): string
    {
        return "platform/qb-imports/{$batch->uuid}/{$i}." . $batch->format;
    }
}
