<?php

// docs/architecture/file-storage.md (D40): code names exactly two disks, `private` and `public`.
// FILES_DRIVER = local (development / one server) | s3 (any S3-compatible store) - the ONLY switch between one server and many.
$s3 = fn (string $bucketEnv, array $extra) => array_merge([
    'driver' => 's3', 'key' => env('S3_KEY'), 'secret' => env('S3_SECRET'), 'region' => env('S3_REGION', 'us-east-1'),
    'bucket' => env($bucketEnv), 'endpoint' => env('S3_ENDPOINT'), 'use_path_style_endpoint' => env('S3_PATH_STYLE', true), 'throw' => true,
], $extra);
$useS3 = env('FILES_DRIVER', 'local') === 's3';

return [

    'default' => 'private',

    'disks' => [
        // student photos/documents, PDFs, imports: never url(), only temporaryUrl() or a controller stream
        'private' => $useS3
            ? $s3('S3_PRIVATE_BUCKET', ['visibility' => 'private'])
            : ['driver' => 'local', 'root' => storage_path('app/private'), 'visibility' => 'private', 'serve' => true, 'throw' => true],

        // logo, favicon, gallery, site images only
        'public' => $useS3
            ? $s3('S3_PUBLIC_BUCKET', ['url' => env('PUBLIC_FILES_URL'), 'visibility' => 'public'])
            : ['driver' => 'local', 'root' => storage_path('app/public'), 'url' => env('APP_URL') . '/storage', 'visibility' => 'public', 'throw' => true],
    ],

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
