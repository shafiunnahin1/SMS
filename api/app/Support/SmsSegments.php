<?php

namespace App\Support;

// docs/I18N.md section 7: how many SMS parts a text costs. GSM 03.38 (basic table + the extension table, whose characters count 2)
// gives 160 per single message / 153 per part; anything else is UCS-2: 70 / 67 UTF-16 code units (an emoji = 2).
// Bengali is never GSM-7, so most of our messages are Unicode - a long one costs several parts.
final class SmsSegments
{
    private const GSM = "@£\$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
    private const EXT = "^{}\\[~]|€\f";                                       // each counts 2 in GSM-7

    /** @return array{segments:int, encoding:'gsm'|'unicode', units:int} */
    public static function count(string $text): array
    {
        if ($text === '') return ['segments' => 0, 'encoding' => 'gsm', 'units' => 0];
        $chars = mb_str_split($text);
        $gsm = collect($chars)->every(fn ($c) => str_contains(self::GSM, $c) || str_contains(self::EXT, $c));
        if ($gsm) {
            $units = collect($chars)->sum(fn ($c) => str_contains(self::EXT, $c) ? 2 : 1);
            return ['segments' => $units <= 160 ? 1 : (int) ceil($units / 153), 'encoding' => 'gsm', 'units' => $units];
        }
        $units = (int) (strlen(mb_convert_encoding($text, 'UTF-16LE', 'UTF-8')) / 2);       // UTF-16 code units (an emoji = 2)
        return ['segments' => $units <= 70 ? 1 : (int) ceil($units / 67), 'encoding' => 'unicode', 'units' => $units];
    }

    /** D56: the parts the institution PAYS for - GSM (English) one per 150 characters, Unicode (Bengali) as the gateway: 70, then 67 */
    public static function billable(string $text): int
    {
        $c = self::count($text);
        if ($c['units'] === 0) return 0;
        return $c['encoding'] === 'gsm' ? (int) ceil($c['units'] / 150) : $c['segments'];
    }
}
