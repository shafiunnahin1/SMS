<?php

// I18N.md: lang/{bn,en,ar}/pdf.php - every PDF's fixed labels

return [
    'receipt' => [
        'title' => 'Money Receipt', 'no' => 'Receipt No', 'date' => 'Date', 'student' => 'Student', 'method' => 'Method',
        'item' => 'Description', 'period' => 'Period', 'paid' => 'Paid (BDT)', 'total' => 'Total',
        'methods' => ['cash' => 'Cash', 'bkash' => 'bKash', 'nagad' => 'Nagad', 'card' => 'Card', 'bank_transfer' => 'Bank transfer', 'cheque' => 'Cheque'],
    ],
    'marksheet' => [
        'title' => 'Marksheet', 'student' => 'Student', 'class' => 'Class/Course', 'roll' => 'Roll', 'issued' => 'Date of issue',
        'subject' => 'Subject', 'full' => 'Full marks', 'obtained' => 'Marks', 'grade' => 'Grade', 'point' => 'Grade point', 'absent' => 'Absent',
        'total' => 'Total', 'percentage' => 'Percentage', 'result' => 'Result', 'passed' => 'Passed', 'failed' => 'Failed',
        'class_teacher' => 'Class teacher', 'head' => 'Head of institution', 'guardian' => 'Guardian',
    ],
    'reports' => [
        'students' => 'Class list', 'attendance' => 'Monthly attendance', 'dues' => 'Due list', 'fees' => 'Fee collection',
        'roll' => 'Roll', 'id' => 'ID', 'name' => 'Name', 'guardian_phone' => 'Guardian phone', 'items' => 'Unpaid items', 'amount' => 'Amount',
        'total' => 'Total', 'count' => ':count student(s)', 'all' => 'All', 'empty' => 'No data', 'printed' => 'Printed',
        'legend' => 'P present, A absent, L late, V leave, H holiday',
    ],
    'consent_form' => [
        'title' => 'Guardian consent form', 'student' => 'Student', 'guardian_phone' => 'Guardian phone',
        'intro' => 'Tick the box of each item you agree to. All but the starred one are optional and can be changed later.',
        'types' => [
            'data_processing' => ['title' => 'Keeping and using the data', 'body' => "The institution keeps your child's data for admission, attendance, results and fees."],
            'sms' => ['title' => 'SMS notifications', 'body' => 'Absence, notice and reminder SMS. Payment receipts and password codes are always sent.'],
            'photo' => ['title' => 'Publishing photos', 'body' => "Use of your child's photo at events or on the website (other than the ID card)."],
            'health_data' => ['title' => 'Health data', 'body' => 'Keeping health records.'],
        ],
        'guardian_sign' => "Guardian's name and signature", 'date' => 'Date', 'draft' => 'This text is a draft; a lawyer reviews it before release.',
    ],
    'qb_omr' => ['student_id' => 'ID number', 'form_code' => 'Form code', 'set' => 'Set', 'class' => 'Class', 'roll' => 'Roll', 'subject' => 'Subject code', 'answers' => 'Answers', 'instructions' => 'Instructions', 'candidate_info' => 'Candidate information', 'name' => 'Name', 'date' => 'Date', 'exam_type' => 'Exam type', 'roll_number' => 'Roll number', 'set_code' => 'Set code', 'department' => 'Group', 'subject_name' => 'Subject', 'paper' => 'Paper', 'exam_types' => ['Daily test', 'Weekly test', 'Monthly test', 'Quiz', 'Half-yearly exam', 'Annual exam'], 'rules' => ['Use a black or blue pen.', 'Fill only one bubble for each question.', 'Keep a wrong bubble fully clean.', 'Fill the roll and set code correctly.'], 'invigilator' => 'Invigilator\'s signature', 'footer' => 'Fill the bubble completely. More than one answer cancels that answer.', 'question' => 'Q', 'answer' => 'Answer', 'mcq_answers' => 'MCQ answers'],   // D127
    'qb_paper' => ['set' => 'Set', 'time' => 'Time', 'minutes' => 'minutes', 'full_marks' => 'Full marks', 'with_answers' => 'With answers', 'answer' => 'Answer', 'choices' => 'Choices', 'true_false' => 'True / False', 'true' => 'True', 'false' => 'False', 'figure_missing' => 'figure could not be printed', 'answer_key' => 'Answer key', 'question_no' => 'Question'],   // QB.8
    'expenses' => ['title' => 'Expense ledger', 'date' => 'Date', 'category' => 'Category', 'item' => 'Description', 'method' => 'Method', 'amount' => 'Amount (BDT)', 'total' => 'Net expenses'],
    'cashbook' => ['title' => 'Daily cashbook', 'section' => 'Section', 'item' => 'Item', 'income' => 'Income', 'outflow' => 'Outflow', 'method' => 'Method', 'category' => 'Category', 'collector' => 'Collector', 'summary' => 'Summary', 'opening_cash' => 'Opening cash', 'expected_closing' => 'Expected closing', 'status' => 'Status', 'history' => 'Revision / counted cash / difference', 'cash' => 'Cash totals'],
    'inventory' => ['receipt_title' => 'Store sale receipt', 'item' => 'Item', 'qty' => 'Qty', 'price' => 'Unit price (BDT)', 'amount' => 'Amount (BDT)', 'total' => 'Total', 'stock' => 'Stock report', 'movements' => 'Stock movements', 'sales' => 'Store sales', 'valuation' => 'Stock valuation', 'code' => 'Code', 'type' => 'Type', 'date' => 'Date', 'avg_cost' => 'Average cost (BDT)', 'value' => 'Value (BDT)', 'receipt' => 'Receipt'],
    'merit' => ['title' => 'Merit list', 'full' => 'Full marks', 'rank' => 'Rank', 'student' => 'Student', 'id' => 'ID', 'roll' => 'Roll', 'batch' => 'Batch', 'total' => 'Total'],   // D161 (1)
];
