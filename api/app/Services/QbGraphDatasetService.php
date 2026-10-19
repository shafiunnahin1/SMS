<?php

namespace App\Services;

use App\Models\QbGraphDataset;
use Illuminate\Support\Str;
use InvalidArgumentException;

// D115 (R2.1.2): qbank's GraphDatasetStorage - the same limits, cell clean-up, checksum and version check - kept in one rows_json
// column (LONGTEXT holds qbank's largest dataset, so no separate gzip file is needed).
class QbGraphDatasetService
{
    private const METADATA = ['chart_type', 'category_column', 'value_columns', 'error_column', 'frequency_mode', 'ogive_direction', 'sort_mode', 'file_name', 'client_version'];

    /** @return array{headers: array, rows: array, checksum: string, row_count: int, column_count: int, rows_json: string} */
    public function normalize(array $headers, array $rows): array
    {
        if ($headers === [] || count($headers) > QbGraphDataset::MAX_COLUMNS) throw new InvalidArgumentException(__('errors.qb_dataset_columns', ['max' => QbGraphDataset::MAX_COLUMNS]));
        if (count($rows) > QbGraphDataset::MAX_ROWS) throw new InvalidArgumentException(__('errors.qb_dataset_rows', ['max' => QbGraphDataset::MAX_ROWS]));
        $heads = [];
        foreach (array_values($headers) as $i => $h) {
            $v = trim((string) $h);
            $heads[] = Str::limit($v === '' ? 'Column ' . ($i + 1) : $v, 160, '');
        }
        $cols = count($heads);
        if (count($rows) * $cols > QbGraphDataset::MAX_CELLS) throw new InvalidArgumentException(__('errors.qb_dataset_cells', ['max' => QbGraphDataset::MAX_CELLS]));
        $out = [];
        foreach (array_values($rows) as $r => $row) {
            if (!is_array($row)) throw new InvalidArgumentException(__('errors.qb_dataset_row', ['row' => $r + 1]));
            $line = [];
            for ($c = 0; $c < $cols; $c++) $line[] = $this->cell($row[$c] ?? null);
            $out[] = $line;
        }
        $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION;
        return ['headers' => $heads, 'rows' => $out, 'checksum' => hash('sha256', json_encode(['headers' => $heads, 'rows' => $out], $flags)),
            'row_count' => count($out), 'column_count' => $cols, 'rows_json' => json_encode($out, $flags)];
    }

    public function create(int $userId, array $in): QbGraphDataset
    {
        $n = $this->normalize($in['headers'], $in['rows']);
        return QbGraphDataset::create(['uuid' => (string) Str::uuid(), 'name' => Str::limit(trim($in['name']) ?: 'Graph dataset', 160, ''),
            'source_type' => Str::limit(trim($in['source_type']) ?: 'manual', 40, ''), 'headers' => $n['headers'], 'row_count' => $n['row_count'],
            'column_count' => $n['column_count'], 'checksum' => $n['checksum'], 'version' => 1, 'rows_json' => $n['rows_json'],
            'metadata' => array_intersect_key($in['metadata'], array_flip(self::METADATA)), 'created_by' => $userId]);
    }

    /** an edit started from an older version is refused (null: the caller did not say, as qbank allows) */
    public function update(QbGraphDataset $d, array $in): ?QbGraphDataset
    {
        if ($in['version'] !== null && $in['version'] !== (int) $d->version) return null;
        $n = $this->normalize($in['headers'], $in['rows']);
        $d->update(['name' => Str::limit(trim($in['name']) ?: $d->name, 160, ''), 'source_type' => Str::limit(trim($in['source_type']) ?: 'manual', 40, ''),
            'headers' => $n['headers'], 'row_count' => $n['row_count'], 'column_count' => $n['column_count'], 'checksum' => $n['checksum'],
            'version' => (int) $d->version + 1, 'rows_json' => $n['rows_json'], 'metadata' => array_intersect_key($in['metadata'], array_flip(self::METADATA))]);
        return $d->fresh();
    }

    public function rows(QbGraphDataset $d): array
    {
        $rows = json_decode((string) $d->rows_json, true);
        return is_array($rows) ? array_values(array_filter($rows, 'is_array')) : [];
    }

    private function cell(mixed $v): string|int|float|null
    {
        if ($v === null) return null;
        if (is_bool($v)) return $v ? 1 : 0;
        if (is_int($v) || is_float($v)) return is_finite((float) $v) ? $v : null;
        $s = trim((string) $v);
        return mb_strlen($s) > QbGraphDataset::MAX_CELL_LENGTH ? mb_substr($s, 0, QbGraphDataset::MAX_CELL_LENGTH) : $s;
    }
}
