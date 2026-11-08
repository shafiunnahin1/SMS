<?php

namespace App\Services\Export;

use App\Exceptions\BusinessException;

// D38 / platform-ops.md section 5.2: authenticated encryption with the requester's passphrase (never stored). PHP's built-in sodium
// (no new package, G7): Argon2id key from the passphrase + a random salt, XChaCha20-Poly1305 secretstream in 1 MiB chunks, so a
// changed, cut or re-ordered byte fails the whole file. Layout: "EDUX1" | salt (16) | stream header (24) | chunks.
final class ExportCrypto
{
    private const MAGIC = 'EDUX1';
    private const CHUNK = 1048576;

    public static function encryptFile(string $plainPath, string $outPath, string $passphrase): void
    {
        $salt = random_bytes(SODIUM_CRYPTO_PWHASH_SALTBYTES);
        $key = self::key($passphrase, $salt);
        [$state, $header] = sodium_crypto_secretstream_xchacha20poly1305_init_push($key);
        $in = fopen($plainPath, 'rb');
        $out = fopen($outPath, 'wb');
        fwrite($out, self::MAGIC . $salt . $header);
        $size = filesize($plainPath);
        $read = 0;
        do {
            $chunk = fread($in, self::CHUNK);
            $read += strlen($chunk);
            $tag = $read >= $size ? SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL : SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_MESSAGE;
            fwrite($out, sodium_crypto_secretstream_xchacha20poly1305_push($state, $chunk, '', $tag));
        } while ($read < $size);
        fclose($in);
        fclose($out);
        sodium_memzero($key);
    }

    /** Wrong passphrase or a changed file: 422 export_decrypt_failed (nothing is written) */
    public static function decryptFile(string $encPath, string $outPath, string $passphrase): void
    {
        $in = fopen($encPath, 'rb');
        $head = fread($in, strlen(self::MAGIC) + SODIUM_CRYPTO_PWHASH_SALTBYTES + SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES);
        if (!str_starts_with((string) $head, self::MAGIC)) { fclose($in); throw new BusinessException('not an export', 'export_decrypt_failed', 422); }
        $salt = substr($head, strlen(self::MAGIC), SODIUM_CRYPTO_PWHASH_SALTBYTES);
        $header = substr($head, strlen(self::MAGIC) + SODIUM_CRYPTO_PWHASH_SALTBYTES);
        $key = self::key($passphrase, $salt);
        $state = sodium_crypto_secretstream_xchacha20poly1305_init_pull($header, $key);
        $out = fopen($outPath, 'wb');
        $final = false;
        try {
            while (!feof($in)) {
                $chunk = fread($in, self::CHUNK + SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_ABYTES);
                if ($chunk === '' || $chunk === false) break;
                $r = sodium_crypto_secretstream_xchacha20poly1305_pull($state, $chunk);
                if ($r === false) throw new BusinessException('decrypt', 'export_decrypt_failed', 422);
                fwrite($out, $r[0]);
                if ($r[1] === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL) { $final = true; break; }
            }
            if (!$final) throw new BusinessException('truncated', 'export_decrypt_failed', 422);
        } catch (\Throwable $e) {
            fclose($out);
            @unlink($outPath);
            throw $e instanceof BusinessException ? $e : new BusinessException('decrypt', 'export_decrypt_failed', 422);
        } finally {
            fclose($in);
            sodium_memzero($key);
        }
        fclose($out);
    }

    private static function key(string $passphrase, string $salt): string
    {
        return sodium_crypto_pwhash(SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES, $passphrase, $salt,
            SODIUM_CRYPTO_PWHASH_OPSLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_MEMLIMIT_INTERACTIVE, SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13);
    }
}
