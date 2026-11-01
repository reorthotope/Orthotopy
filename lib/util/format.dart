/// `1234567` → `1.2M`, `15400` → `15.4k`, `900` → `900`.
String formatCount(int n) {
  if (n >= 1000000) {
    final v = n / 1000000;
    return '${v.toStringAsFixed(v >= 10 ? 0 : 1)}M';
  }
  if (n >= 1000) {
    final v = n / 1000;
    return '${v.toStringAsFixed(v >= 10 ? 0 : 1)}k';
  }
  return '$n';
}

const Map<String, String> _categoryLabels = {
  'apps': 'Apps',
  'games': 'Games',
  'utilities': 'Utilities',
  'productivity': 'Productivity',
  'multimedia': 'Multimedia',
  'communication': 'Communication',
  'developer-tools': 'Developer tools',
};

String categoryLabel(String key) => _categoryLabels[key] ?? key;
