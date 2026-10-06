<!doctype html>
<html lang="{{ $locale }}" dir="{{ $dir }}">
<head>
<meta charset="utf-8">
<style>
  body { font-family: sans-serif; font-size: 12px; }
  .pdf-header { border-bottom: 3px solid {{ $theme['primary_color'] }}; padding-bottom: 6px; margin-bottom: 12px; }
  .pdf-header h1 { font-size: 16px; margin: 0; }
</style>
</head>
<body>
  <div class="pdf-header">
    @if (!empty($theme['logo_url']))<img src="{{ $theme['logo_url'] }}" height="40" alt="">@endif
    <h1>{{ $institution?->name }}</h1>
  </div>
  @yield('content')
  {{ $body ?? '' }}
</body>
</html>
