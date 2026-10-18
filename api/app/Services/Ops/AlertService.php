<?php

namespace App\Services\Ops;

use App\Support\Tenancy;
use Illuminate\Support\Facades\{Cache, Http, Log, Mail};
use Throwable;

// Step 9.1 (D64): tells a person that something broke (webhook, Telegram, email - the owner wants Telegram and email) - an unexpected exception, a queue backlog, a job that failed for good.
// G9 / privacy: an alert carries the error CLASS, the place in the code, the route and the institution id - never the exception
// message (it can hold SQL values, phone numbers, amounts); the full details stay in the server log. The same alert is sent once
// per throttle window. An alert that cannot be delivered is logged as a warning and never throws (no loop through the reporter).
class AlertService
{
    public function enabled(): bool
    {
        return (bool) config('monitoring.webhook_url') || config('monitoring.emails') !== [] || $this->telegram();
    }

    private function telegram(): bool
    {
        return (bool) config('monitoring.telegram_bot_token') && (bool) config('monitoring.telegram_chat_id');
    }

    /** Returns true when the alert was sent now, false when switched off or throttled */
    public function send(string $title, array $context, string $key): bool
    {
        if (!$this->enabled()) return false;
        // throttle through the cache - but an unreachable cache (Redis down) is exactly when an alert matters: then send unthrottled
        try {
            if (!Cache::add('ops_alert:' . sha1($key), 1, now()->addMinutes(max(1, config('monitoring.throttle_minutes'))))) return false;
        } catch (Throwable) {
        }
        $text = '[' . config('app.name') . ' / ' . app()->environment() . '] ' . $title . "\n"
            . collect($context)->map(fn ($v, $k) => "{$k}: {$v}")->implode("\n");
        try {
            if ($url = config('monitoring.webhook_url')) Http::timeout(5)->asJson()->post($url, ['text' => $text])->throw();
            if ($this->telegram()) Http::timeout(5)->asJson()->post('https://api.telegram.org/bot' . config('monitoring.telegram_bot_token') . '/sendMessage',
                ['chat_id' => config('monitoring.telegram_chat_id'), 'text' => $text, 'disable_web_page_preview' => true])->throw();
            foreach (config('monitoring.emails') as $to) Mail::raw($text, fn ($m) => $m->to($to)->subject('[alert] ' . $title));
        } catch (Throwable $e) {
            Log::warning('alert not delivered', ['title' => $title, 'reason' => get_class($e)]);   // never the URL: it holds the bot token
            return false;
        }
        return true;
    }

    public function exception(Throwable $e): bool
    {
        $where = basename($e->getFile()) . ':' . $e->getLine();
        $request = app()->runningInConsole() ? null : request();
        return $this->send('Unexpected error: ' . get_class($e), array_filter([
            'where' => $where,
            'route' => $request ? $request->method() . ' ' . ($request->route()?->uri() ?? $request->path()) : 'console',
            'institution' => Tenancy::current()?->id,
            'time' => now()->toIso8601String(),
        ], fn ($v) => $v !== null), 'exception:' . get_class($e) . '@' . $where);
    }
}
