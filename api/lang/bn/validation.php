<?php

// Bengali validation messages for the rules the app uses (docs/I18N.md section 6). Any other rule falls back to English
// (config app.fallback_locale) - no translation package is added (G7); the full set can come later.
return [
    'accepted'       => ':attribute গ্রহণ করতে হবে।',
    'array'          => ':attribute একটি তালিকা হতে হবে।',
    'boolean'        => ':attribute হ্যাঁ বা না হতে হবে।',
    'confirmed'      => ':attribute নিশ্চিতকরণ মেলেনি।',
    'date'           => ':attribute সঠিক তারিখ নয়।',
    'date_format'    => ':attribute-এর বিন্যাস :format হতে হবে।',
    'before_or_equal'=> ':attribute :date বা তার আগের তারিখ হতে হবে।',
    'after_or_equal' => ':attribute :date বা তার পরের তারিখ হতে হবে।',
    'digits'         => ':attribute :digits অঙ্কের হতে হবে।',
    'distinct'       => ':attribute-এ একই মান দুবার আছে।',
    'email'          => ':attribute সঠিক ইমেইল নয়।',
    'exists'         => 'বাছাই করা :attribute পাওয়া যায়নি।',
    'file'           => ':attribute একটি ফাইল হতে হবে।',
    'image'          => ':attribute একটি ছবি হতে হবে।',
    'in'             => 'বাছাই করা :attribute গ্রহণযোগ্য নয়।',
    'integer'        => ':attribute পূর্ণসংখ্যা হতে হবে।',
    'max'            => [
        'array'   => ':attribute-এ :max-টির বেশি থাকতে পারবে না।',
        'file'    => ':attribute :max কিলোবাইটের বেশি হতে পারবে না।',
        'numeric' => ':attribute :max-এর বেশি হতে পারবে না।',
        'string'  => ':attribute :max অক্ষরের বেশি হতে পারবে না।',
    ],
    'mimes'          => ':attribute-এর ধরন হতে হবে: :values।',
    'min'            => [
        'array'   => ':attribute-এ অন্তত :min-টি থাকতে হবে।',
        'file'    => ':attribute অন্তত :min কিলোবাইট হতে হবে।',
        'numeric' => ':attribute অন্তত :min হতে হবে।',
        'string'  => ':attribute অন্তত :min অক্ষরের হতে হবে।',
    ],
    'numeric'        => ':attribute সংখ্যা হতে হবে।',
    'regex'          => ':attribute-এর বিন্যাস সঠিক নয়।',
    'required'       => ':attribute দিতে হবে।',
    'required_if'    => ':other :value হলে :attribute দিতে হবে।',
    'required_without' => ':values না থাকলে :attribute দিতে হবে।',
    'size'           => [
        'array'   => ':attribute-এ :size-টি থাকতে হবে।',
        'string'  => ':attribute :size অক্ষরের হতে হবে।',
        'numeric' => ':attribute :size হতে হবে।',
        'file'    => ':attribute :size কিলোবাইট হতে হবে।',
    ],
    'string'         => ':attribute লেখা হতে হবে।',
    'unique'         => 'এই :attribute আগে থেকেই আছে।',
    'url'            => ':attribute সঠিক লিংক নয়।',
    // field names in Bengali, so a message reads "অভিভাবকের ফোন দিতে হবে" and not "guardian phone দিতে হবে"
    'attributes'     => [
        'name' => 'নাম', 'guardian_phone' => 'অভিভাবকের ফোন', 'phone' => 'ফোন', 'email' => 'ইমেইল', 'password' => 'পাসওয়ার্ড',
        'student_id' => 'ছাত্র আইডি', 'employee_id' => 'কর্মী আইডি', 'batch' => 'একক', 'batch_id' => 'একক', 'program_id' => 'শ্রেণি/কোর্স',
        'roll_no' => 'রোল', 'gender' => 'লিঙ্গ', 'date_of_birth' => 'জন্মতারিখ', 'admission_date' => 'ভর্তির তারিখ', 'father_name' => 'পিতার নাম',
        'mother_name' => 'মাতার নাম', 'address' => 'ঠিকানা', 'photo' => 'ছবি', 'file' => 'ফাইল', 'full_marks' => 'পূর্ণমান', 'pass_marks' => 'পাস নম্বর',
        'monthly_fee' => 'মাসিক ফি', 'amount' => 'পরিমাণ', 'date' => 'তারিখ', 'status' => 'অবস্থা', 'login' => 'লগইন আইডি',
    ],
];
