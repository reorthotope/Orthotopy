import 'dart:async';
import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/catalog.dart';

/// Loads the Orthotopy catalog with a three-tier fallback:
///
///   1. the live catalog on GitHub, so every platform stays in sync;
///   2. the last successfully fetched copy, cached on-device;
///   3. the catalog bundled with the app (works fully offline).
class CatalogRepository {
  CatalogRepository({http.Client? client, String? remoteUrl})
      : _client = client ?? http.Client(),
        remoteUrl = remoteUrl ?? defaultRemoteUrl;

  static const String defaultRemoteUrl =
      'https://raw.githubusercontent.com/reorthotope/Orthotopy/main/catalog/catalog.json';
  static const String _cacheKey = 'orthotopy.catalog.v1';

  final http.Client _client;
  final String remoteUrl;
  final String assetPath = 'catalog/catalog.json';

  Future<Catalog> load() async {
    final remote = await _fetchRemote();
    final body = remote ?? await _readCache() ?? await _readAsset();
    if (remote != null) unawaited(_writeCache(remote));
    return Catalog.fromJson(jsonDecode(body) as Map<String, dynamic>);
  }

  Future<String?> _fetchRemote() async {
    try {
      final response = await _client
          .get(Uri.parse(remoteUrl), headers: {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 8));
      if (response.statusCode == 200 && response.body.isNotEmpty) return response.body;
    } on Object {
      // Fall through to the next tier.
    }
    return null;
  }

  Future<String?> _readCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_cacheKey);
    } on Object {
      return null;
    }
  }

  Future<void> _writeCache(String body) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, body);
    } on Object {
      // Caching is best-effort only.
    }
  }

  Future<String> _readAsset() => rootBundle.loadString(assetPath);
}
