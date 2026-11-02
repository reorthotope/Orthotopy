import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show ThemeMode;
import 'package:shared_preferences/shared_preferences.dart';

import '../data/install_resolver.dart';
import '../models/catalog.dart';

/// Drives the adaptive navigation shell (bottom bar on phones, rail on
/// desktop/web). Pages can jump straight to a tab — e.g. the Home search
/// card opens Browse with a pre-filled query.
class ShellController extends ChangeNotifier {
  int _index = 0;
  String _pendingQuery = '';

  int get index => _index;
  String get pendingQuery => _pendingQuery;

  void go(int index) {
    if (index == _index) return;
    _index = index;
    notifyListeners();
  }

  void goBrowse({String query = ''}) {
    _pendingQuery = query;
    _index = 1;
    notifyListeners();
  }

  void consumePendingQuery() {
    _pendingQuery = '';
  }
}

/// Holds the catalog plus browse filters (search text, category) and the
/// [InstallResolver] used by every install button.
class CatalogProvider extends ChangeNotifier {
  CatalogProvider({required Future<Catalog> Function() loadCatalog, InstallResolver? resolver})
      : _loadCatalog = loadCatalog,
        resolver = resolver ?? InstallResolver();

  final Future<Catalog> Function() _loadCatalog;
  final InstallResolver resolver;

  Catalog? catalog;
  bool loading = false;
  Object? error;

  String query = '';
  String category = 'all';

  Future<void> load() async {
    if (loading) return;
    loading = true;
    error = null;
    notifyListeners();
    try {
      catalog = await _loadCatalog();
    } on Object catch (e) {
      error = e;
    }
    loading = false;
    notifyListeners();
  }

  Future<void> refresh() async {
    catalog = null;
    await load();
  }

  void setQuery(String value) {
    if (value == query) return;
    query = value;
    notifyListeners();
  }

  void setCategory(String value) {
    if (value == category) return;
    category = value;
    notifyListeners();
  }

  bool matches(AppEntry app) {
    if (category != 'all' && app.category != category) return false;
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return app.name.toLowerCase().contains(q) ||
        app.tagline.toLowerCase().contains(q) ||
        app.description.toLowerCase().contains(q) ||
        app.developer.name.toLowerCase().contains(q) ||
        app.tags.any((tag) => tag.toLowerCase().contains(q));
  }

  List<AppEntry> filteredApps() {
    final catalog = this.catalog;
    if (catalog == null) return const [];
    return catalog.apps.where(matches).toList(growable: false);
  }
}

/// Light/dark mode preference, persisted on-device.
class ThemeController extends ChangeNotifier {
  ThemeMode _mode = ThemeMode.dark;

  ThemeMode get mode => _mode;

  Future<void> restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString('orthotopy.theme');
      if (stored != null) {
        _mode = ThemeMode.values
            .firstWhere((m) => m.name == stored, orElse: () => ThemeMode.dark);
        notifyListeners();
      }
    } on Object {
      // Defaults are fine.
    }
  }

  Future<void> setMode(ThemeMode mode) async {
    _mode = mode;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('orthotopy.theme', mode.name);
    } on Object {
      // Persistence is best-effort only.
    }
  }

  void toggle() =>
      setMode(_mode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark);
}
