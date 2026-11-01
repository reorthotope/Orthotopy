import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/catalog.dart';

/// Turns an [InstallTarget] into a URL the OS can open.
///
/// Orthotopy's install buttons lead straight to GitHub Releases:
///
/// * `url` targets are stable `releases/latest/download/<asset>` links that
///   make the browser auto-download the newest build with that exact name.
/// * `assetRegex` targets are resolved at runtime via `api.github.com`, so
///   apps whose asset names embed a version number still get a true
///   direct-download link without the catalog needing an update.
/// * Anything unresolved falls back to the repo's release page.
class InstallResolver {
  InstallResolver({http.Client? client, String? apiBase})
      : _client = client ?? http.Client(),
        apiBase = apiBase ?? 'https://api.github.com';

  final http.Client _client;
  final String apiBase;

  Future<Uri?> resolve(AppEntry app, String platform) async {
    final target = app.targetFor(platform) ?? app.targetFor('web');
    if (target == null) return app.releasesUrl;
    final url = target.url;
    if (url != null && url.isNotEmpty) {
      return Uri.tryParse(url) ?? app.releasesUrl;
    }
    final pattern = target.assetRegex;
    if (pattern != null && pattern.isNotEmpty) {
      final resolved = await _resolveAsset(app.repo, pattern);
      if (resolved != null) return resolved;
    }
    return app.releasesUrl;
  }

  Future<Uri?> _resolveAsset(String repo, String pattern) async {
    try {
      final response = await _client
          .get(
            Uri.parse('$apiBase/repos/$repo/releases/latest'),
            headers: {'Accept': 'application/vnd.github+json'},
          )
          .timeout(const Duration(seconds: 8));
      if (response.statusCode != 200) return null;
      final assets = ((jsonDecode(response.body) as Map<String, dynamic>)['assets']
              as List?) ??
          const [];
      final regex = RegExp(pattern);
      for (final asset in assets.whereType<Map<String, dynamic>>()) {
        final name = asset['name'] as String? ?? '';
        if (regex.firstMatch(name) != null) {
          final downloadUrl = asset['browser_download_url'] as String?;
          if (downloadUrl != null) return Uri.parse(downloadUrl);
        }
      }
    } on Object {
      // Graceful degradation: open the release page instead.
    }
    return null;
  }
}
