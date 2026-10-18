<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

// PUT /admin/settings/terminology { terminology: { batch: { bn: "শাখা", en: "Section" }, ... } } - replaces all overrides.
// Only keys of the institution type's terms and the platform locales are accepted.
class UpdateTerminologyRequest extends FormRequest
{
    public const LOCALES = ['bn', 'en', 'ar'];

    public function authorize(): bool { return true; }   // role:admin + tenant.user on the route

    public function rules(): array
    {
        return [
            'terminology'       => ['present', 'array'],
            'terminology.*'     => ['array'],
            'terminology.*.*'   => ['nullable', 'string', 'max:50'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $v) {
            $keys = array_keys(config('institution_types.' . app('currentInstitution')->institution_type . '.terms', []));
            foreach ((array) $this->input('terminology', []) as $key => $values) {
                if (!in_array($key, $keys, true)) { $v->errors()->add("terminology.{$key}", 'Unknown term key.'); continue; }
                foreach (array_keys((array) $values) as $locale) {
                    if (!in_array($locale, self::LOCALES, true)) $v->errors()->add("terminology.{$key}.{$locale}", 'Unknown locale.');
                }
            }
        }];
    }

    /** Overrides without empty values, so a cleared field falls back to the type default */
    public function overrides(): array
    {
        $out = [];
        foreach ($this->validated('terminology') as $key => $values) {
            $kept = array_filter((array) $values, fn ($t) => is_string($t) && trim($t) !== '');
            if ($kept) $out[$key] = array_map('trim', $kept);
        }
        return $out;
    }
}
