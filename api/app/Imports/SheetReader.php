<?php

namespace App\Imports;

use App\Exceptions\BusinessException;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

// docs/modules/data-migration.md: UTF-8 CSV (with or without BOM) or XLSX; the first row is the header. Returns trimmed strings,
// Excel date cells as Y-m-d. A CSV that is not valid UTF-8 (old ANSI/Bijoy files) is refused - never guessed (the spec's limit (a)).
final class SheetReader
{
    /** @return array{headers: string[], rows: array<int, array<string, string>>}  rows keyed by header, row_no = sheet row */
    public static function read(string $path, string $ext): array
    {
        if (in_array($ext, ['csv', 'txt'], true)) {
            $raw = file_get_contents($path);
            if (str_starts_with($raw, "\xEF\xBB\xBF")) $raw = substr($raw, 3);
            if (!mb_check_encoding($raw, 'UTF-8')) throw new BusinessException('not utf-8', 'bad_encoding', 422);
            $lines = array_map('str_getcsv', preg_split('/\r\n|\n|\r/', rtrim($raw, "\r\n")));
        } else {
            $sheet = IOFactory::load($path)->getSheet(0);
            $lines = [];
            foreach ($sheet->getRowIterator() as $row) {
                $cells = [];
                foreach ($row->getCellIterator() as $cell) {
                    $v = $cell->getValue();
                    if (is_numeric($v) && ExcelDate::isDateTime($cell)) $v = ExcelDate::excelToDateTimeObject($v)->format('Y-m-d');
                    $cells[] = $v;
                }
                $lines[] = $cells;
            }
        }
        $headers = array_map(fn ($h) => trim((string) $h), array_shift($lines) ?? []);
        $rows = [];
        foreach ($lines as $i => $line) {
            if (count(array_filter($line, fn ($v) => trim((string) $v) !== '')) === 0) continue;     // blank rows are not data
            $rows[$i + 2] = array_combine($headers, array_map(fn ($v) => trim((string) $v), array_pad(array_slice($line, 0, count($headers)), count($headers), '')));
        }
        return ['headers' => $headers, 'rows' => $rows];
    }
}
