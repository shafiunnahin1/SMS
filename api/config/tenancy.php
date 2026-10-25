<?php

return [
    'base_domain'     => env('APP_BASE_DOMAIN', 'schoolapp.com'),
    'central_domains' => array_filter(explode(',', env('CENTRAL_DOMAINS', 'schoolapp.com'))),
    'super_admin_domain' => env('SUPER_ADMIN_DOMAIN', 'admin.schoolapp.com'),
    'cname_target'    => env('DOMAIN_CNAME_TARGET', 'domains.schoolapp.com'),
    'a_target'        => env('DOMAIN_A_TARGET'),
    'require_approval'=> env('DOMAIN_REQUIRE_APPROVAL', true),
    'max_domains'     => env('DOMAIN_MAX_PER_INSTITUTION', 2),
    // Who may call /api/internal/* (Caddy's on-demand TLS "ask"). Host install: loopback. Docker compose: add the compose network, e.g. 172.16.0.0/12
    'internal_ips'    => array_filter(explode(',', env('INTERNAL_IPS', '127.0.0.1,::1'))),
    // A tenant can never take these slugs
    // D165 (1): the host of the self-registered students' platform institution (learn.<base domain>); no other institution may take it
    'learners_slug'   => 'learn',
    'reserved_slugs'  => ['www','admin','api','app','mail','smtp','ftp','domains','cdn','static',
                          'assets','status','support','help','blog','docs','demo','test','staging','dev'],
];
