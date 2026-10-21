<?php

namespace Database\Seeders;

use App\Models\{QbClassLevel, QbSubject};
use Illuminate\Database\Seeder;

// QB.1 (D65, docs/modules/question-bank.md): the platform curriculum's starting classes and subjects, copied as DATA
// from the owner's qbank project (database/seeders/ClassLevelSeeder.php, SubjectSeeder.php at 40f769c). Idempotent: matched by
// name_en, so a re-run adds what is missing and never duplicates. Chapters and topics come from the writers / qbank import (QB.11).
// qbank's 'pre-primary' level has no value in qb_class_levels.education_level: it is stored as 'other'.
class QbCurriculumSeeder extends Seeder
{
    /** [name_bn, name_en, education_level] in qbank's order */
    private const CLASSES = [
        ['প্লে', 'Play', 'other'],
        ['নার্সারি', 'Nursery', 'other'],
        ['কেজি', 'KG', 'other'],
        ['১ম শ্রেণি', 'Class 1', 'primary'],
        ['২য় শ্রেণি', 'Class 2', 'primary'],
        ['৩য় শ্রেণি', 'Class 3', 'primary'],
        ['৪র্থ শ্রেণি', 'Class 4', 'primary'],
        ['৫ম শ্রেণি', 'Class 5', 'primary'],
        ['৬ষ্ঠ শ্রেণি', 'Class 6', 'secondary'],
        ['৭ম শ্রেণি', 'Class 7', 'secondary'],
        ['৮ম শ্রেণি', 'Class 8', 'secondary'],
        ['৯ম শ্রেণি', 'Class 9', 'secondary'],
        ['১০ম শ্রেণি', 'Class 10', 'secondary'],
        ['১১শ শ্রেণি', 'Class 11', 'higher_secondary'],
        ['১২শ শ্রেণি', 'Class 12', 'higher_secondary'],
    ];

    /** [name_bn, name_en, the class names_en it is taught in] */
    private const SUBJECTS = [
        ['আমার বই', 'My Book', ['Play', 'Nursery', 'KG']],
        ['এসো লিখতে শিখি', 'Let Us Learn to Write', ['Play', 'Nursery', 'KG']],
        ['ফ্ল্যাশ কার্ড', 'Flash Card', ['Play', 'Nursery', 'KG']],
        ['ফ্লিপ চার্ট', 'Flip Chart', ['Play', 'Nursery', 'KG']],
        ['প্রাথমিক গণিত', 'Primary Mathematics', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5']],
        ['প্রাথমিক বিজ্ঞান', 'Primary Science', ['Class 3', 'Class 4', 'Class 5']],
        ['পরিবেশ পরিচিতি, সমাজ ও বিজ্ঞান', 'Environment, Society and Science', ['Class 1', 'Class 2']],
        ['বাংলা', 'Bangla', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5']],
        ['বাংলা ১ম পত্র', 'Bangla 1st Paper', ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12']],
        ['বাংলা ২য় পত্র', 'Bangla 2nd Paper', ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12']],
        ['ইংরেজি', 'English', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5']],
        ['ইংরেজি ১ম পত্র', 'English 1st Paper', ['Play', 'Nursery', 'KG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12']],
        ['ইংরেজি ২য় পত্র', 'English 2nd Paper', ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12']],
        ['গণিত', 'Mathematics', ['Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']],
        ['সাধারণ বিজ্ঞান', 'General Science', ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10']],
        ['বাংলাদেশ ও বিশ্বপরিচয়', 'Bangladesh and Global Studies', ['Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['তথ্য ও যোগাযোগ প্রযুক্তি', 'Information and Communication Technology', ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12']],
        ['ধর্ম ও নৈতিক শিক্ষা', 'Religion and Moral Education', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['ইসলাম ও নৈতিক শিক্ষা', 'Islam and Moral Education', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['হিন্দুধর্ম ও নৈতিক শিক্ষা', 'Hindu Religion and Moral Education', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['বৌদ্ধধর্ম ও নৈতিক শিক্ষা', 'Buddhist Religion and Moral Education', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['খ্রিষ্টধর্ম ও নৈতিক শিক্ষা', 'Christian Religion and Moral Education', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['চারু ও কারুকলা', 'Art and Craft', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['শারীরিক শিক্ষা ও স্বাস্থ্য', 'Physical Education and Health', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['সঙ্গীত', 'Music', ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8']],
        ['পদার্থ', 'Physics', ['Class 9', 'Class 10']],
        ['রসায়ন', 'Chemistry', ['Class 9', 'Class 10']],
        ['জীববিজ্ঞান', 'Biology', ['Class 9', 'Class 10']],
        ['উচ্চতর গণিত', 'Higher Math', ['Class 9', 'Class 10']],
        ['উচ্চতর গণিত ১ম পত্র', 'Higher Mathematics 1st Paper', ['Class 11', 'Class 12']],
        ['উচ্চতর গণিত ২য় পত্র', 'Higher Mathematics 2nd Paper', ['Class 11', 'Class 12']],
        ['হিসাববিজ্ঞান', 'Accounting', ['Class 9', 'Class 10']],
        ['হিসাববিজ্ঞান ১ম পত্র', 'Accounting 1st Paper', ['Class 11', 'Class 12']],
        ['হিসাববিজ্ঞান ২য় পত্র', 'Accounting 2nd Paper', ['Class 11', 'Class 12']],
        ['ফিন্যান্স ও ব্যাংকিং', 'Finance and Banking', ['Class 9', 'Class 10']],
        ['ফিন্যান্স, ব্যাংকিং ও বিমা ১ম পত্র', 'Finance, Banking and Insurance 1st Paper', ['Class 11', 'Class 12']],
        ['ফিন্যান্স, ব্যাংকিং ও বিমা ২য় পত্র', 'Finance, Banking and Insurance 2nd Paper', ['Class 11', 'Class 12']],
        ['ব্যবসায় উদ্যোগ', 'Business Entrepreneurship', ['Class 9', 'Class 10']],
        ['ব্যবসায় উদ্যোগ ১ম পত্র', 'Business Entrepreneurship 1st Paper', ['Class 11', 'Class 12']],
        ['ব্যবসায় উদ্যোগ ২য় পত্র', 'Business Entrepreneurship 2nd Paper', ['Class 11', 'Class 12']],
        ['বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা ১ম পত্র', 'History of Bangladesh and World Civilization 1st Paper', ['Class 11', 'Class 12']],
        ['বাংলাদেশের ইতিহাস ও বিশ্বসভ্যতা ২য় পত্র', 'History of Bangladesh and World Civilization 2nd Paper', ['Class 11', 'Class 12']],
        ['ভূগোল ও পরিবেশ', 'Geography and Environment', ['Class 9', 'Class 10']],
        ['ভূগোল ও পরিবেশ ১ম পত্র', 'Geography and Environment 1st Paper', ['Class 11', 'Class 12']],
        ['ভূগোল ও পরিবেশ ২য় পত্র', 'Geography and Environment 2nd Paper', ['Class 11', 'Class 12']],
        ['পৌরনীতি ও সুশাসন', 'Civics and Good Governance', ['Class 9', 'Class 10']],
        ['পৌরনীতি ও সুশাসন ১ম পত্র', 'Civics and Good Governance 1st Paper', ['Class 11', 'Class 12']],
        ['পৌরনীতি ও সুশাসন ২য় পত্র', 'Civics and Good Governance 2nd Paper', ['Class 11', 'Class 12']],
        ['অর্থনীতি', 'Economics', ['Class 9', 'Class 10']],
        ['অর্থনীতি ১ম পত্র', 'Economics 1st Paper', ['Class 11', 'Class 12']],
        ['অর্থনীতি ২য় পত্র', 'Economics 2nd Paper', ['Class 11', 'Class 12']],
        ['কৃষিশিক্ষা', 'Agriculture Studies', ['Class 9', 'Class 10']],
        ['কৃষিশিক্ষা ১ম পত্র', 'Agriculture Studies 1st Paper', ['Class 11', 'Class 12']],
        ['কৃষিশিক্ষা ২য় পত্র', 'Agriculture Studies 2nd Paper', ['Class 11', 'Class 12']],
        ['গার্হস্থ্যবিজ্ঞান', 'Home Science', ['Class 9', 'Class 10']],
    ];

    public function run(): void
    {
        $ids = [];
        foreach (self::CLASSES as $i => [$bn, $en, $level]) {
            $ids[$en] = QbClassLevel::firstOrCreate(['name_en' => $en], ['name_bn' => $bn, 'education_level' => $level, 'sort_order' => $i + 1])->id;
        }
        foreach (self::SUBJECTS as $i => [$bn, $en, $classes]) {
            $subject = QbSubject::firstOrCreate(['name_en' => $en], ['name_bn' => $bn, 'sort_order' => $i + 1]);
            $subject->classLevels()->syncWithoutDetaching(array_map(fn ($c) => $ids[$c], $classes));
        }
    }
}
