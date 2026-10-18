<?php

namespace Tests\Feature\I18n;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/I18N.md section 14 "ApiMessageLocaleTest": the same error in each language has its own `message`; the `error` code is the same.
class ApiMessageLocaleTest extends TestCase
{
    use RefreshDatabase, LocaleRequests;

    public function test_errors_keep_their_code_and_change_their_message_with_the_language(): void
    {
        $school = $this->makeInstitution('msg');
        $host = $this->hostOf($school);
        $teacher = $this->makeUser($school, 'teacher');

        $cases = [
            'unauthenticated'     => fn (array $h) => $this->req('GET', $host, 'notifications', null, $h),
            'validation_failed'   => fn (array $h) => $this->req('POST', $host, 'auth/login', null, $h, []),
            'invalid_credentials' => fn (array $h) => $this->req('POST', $host, 'auth/login', null, $h, ['login' => 'nobody@x.test', 'password' => 'wrong-Pass1']),
            'forbidden'           => fn (array $h) => $this->req('GET', $host, 'settings', $teacher, $h),
            'not_found'           => fn (array $h) => $this->req('GET', $host, 'no-such-route', null, $h),
        ];
        foreach ($cases as $code => $call) {
            $bn = $call(['Accept-Language' => 'bn']);
            $en = $call(['Accept-Language' => 'en']);
            $this->assertSame([$code, $code], [$bn->json('error'), $en->json('error')], $code);
            $this->assertSame(__("errors.{$code}", [], 'bn'), $bn->json('message'), "{$code} bn");
            $this->assertSame(__("errors.{$code}", [], 'en'), $en->json('message'), "{$code} en");
            $this->assertNotSame($bn->json('message'), $en->json('message'), "{$code}: one message per language");
        }
    }

    public function test_validation_field_messages_follow_the_language_too(): void
    {
        $host = $this->hostOf($this->makeInstitution('msg'));
        $bn = $this->req('POST', $host, 'auth/login', null, ['Accept-Language' => 'bn'], []);
        $en = $this->req('POST', $host, 'auth/login', null, ['Accept-Language' => 'en'], []);
        $this->assertStringContainsString('দিতে হবে', $bn->json('errors.login.0'));
        $this->assertStringContainsString('required', $en->json('errors.login.0'));
    }

    public function test_a_business_error_is_translated_with_its_parameters(): void
    {
        app()->setLocale('en');
        $e = new \App\Exceptions\BusinessException('dev text', 'holiday_date', 422, ['date' => '2026-12-16']);
        $this->assertSame('Attendance cannot be taken on a holiday (2026-12-16).', $e->render()->getData(true)['message']);
        app()->setLocale('bn');
        $this->assertSame('ছুটির দিনে উপস্থিতি নেওয়া যায় না (2026-12-16)।', $e->render()->getData(true)['message']);
        $unknown = new \App\Exceptions\BusinessException('kept as is', 'some_new_code');
        $this->assertSame('kept as is', $unknown->render()->getData(true)['message']);
    }
}
