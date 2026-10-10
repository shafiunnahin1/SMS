<?php

// Import template texts (data-migration.md, student-import.md)
return [
    'instructions_title' => 'নির্দেশনা',
    'instructions' => [
        'প্রথম শিটে প্রতিটি সারিতে একজন ছাত্র। প্রথম সারির শিরোনাম বদলাবেন না (না মিললে আপলোডের পর ঘর মেলাতে পারবেন)।',
        'আবশ্যিক: name, guardian_phone (01XXXXXXXXX), batch (দ্বিতীয় শিটের নাম বা নম্বর; কোচিং-এ একাধিক হলে কমা দিয়ে)।',
        'student_id ফাঁকা রাখলে স্বয়ংক্রিয় আইডি তৈরি হবে; আগে থেকে থাকা আইডি আবার আমদানি হয় না (বাদ যায়)।',
        'gender: male / female / other; তারিখ: YYYY-MM-DD।',
        'আপলোড → ঘর মেলানো → পরীক্ষা (কিছু লেখে না) → চালান। ৭ দিনের মধ্যে ফেরানো যায়।',
        'CSV দিলে UTF-8 হতে হবে (Excel-এ "CSV UTF-8")। সর্বোচ্চ ২০,০০০ সারি, ১০ MB।',
    ],
];
