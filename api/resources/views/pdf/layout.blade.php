<!doctype html>
<html lang="{{ $locale }}" dir="{{ $dir }}">
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Noto Sans Bengali', 'Noto Sans Arabic', 'Noto Sans', sans-serif; font-size: 12px; margin: 0; }
  .pdf-header { border-bottom: 3px solid {{ $theme['primary_color'] }}; padding-bottom: 6px; margin-bottom: 12px; }
  .pdf-header h1 { font-size: 16px; margin: 0; }
</style>
</head>
<body>
  <div class="pdf-header">
    @if (!empty($logo))<img src="{{ $logo }}" height="40" alt="">@endif
    <h1>{{ $institution?->name }}</h1>
  </div>
  @yield('content')
  {{ $body ?? '' }}
</body>
</html>
