import 'package:flutter/foundation.dart';

/// Immutable catalog models shared by every Orthotopy client.
///
/// The canonical catalog lives at `catalog/catalog.json` in the repo and is
/// fetched at runtime, so every platform (web, Android, desktop) shows the
/// same up-to-date store without shipping a new build.

@immutable
class Catalog {
  final int schemaVersion;
  final String updatedAt;
  final List<AppEntry> apps;

  const Catalog({
    required this.schemaVersion,
    required this.updatedAt,
    required this.apps,
  });

  static Catalog fromJson(Map<String, dynamic> json) => Catalog(
        schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
        updatedAt: json['updatedAt'] as String? ?? '',
        apps: ((json['apps'] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(AppEntry.fromJson)
            .toList(growable: false),
      );
}

@immutable
class Developer {
  final String name;
  final String handle;

  const Developer({required this.name, required this.handle});

  static Developer fromJson(Map<String, dynamic> json) => Developer(
        name: (json['name'] as String?) ?? (json['handle'] as String?) ?? 'Unknown',
        handle: (json['handle'] as String?) ?? (json['name'] as String?) ?? 'unknown',
      );
}

/// One installable target of an app, keyed by platform.
///
/// * `url` — a stable direct-download link, typically
///   `https://github.com/owner/repo/releases/latest/download/<asset>` which
///   always points at the newest release asset with that exact name.
/// * `assetRegex` — resolved at runtime against the repo's latest GitHub
///   release, for apps whose asset names embed a version number.
@immutable
class InstallTarget {
  final String platform;
  final String? url;
  final String? assetRegex;

  const InstallTarget({required this.platform, this.url, this.assetRegex});

  static InstallTarget fromJson(Map<String, dynamic> json) => InstallTarget(
        platform: json['platform'] as String,
        url: json['url'] as String?,
        assetRegex: json['assetRegex'] as String?,
      );
}

@immutable
class AppEntry {
  final String id;
  final String name;
  final String tagline;
  final String description;
  final String category;
  final String repo;
  final Developer developer;
  final List<String> platforms;
  final List<String> tags;
  final String? website;
  final String? latestVersion;
  final String? releasedAt;
  final List<InstallTarget> installTargets;
  final int stars;
  final int downloads;

  const AppEntry({
    required this.id,
    required this.name,
    required this.tagline,
    required this.description,
    required this.category,
    required this.repo,
    required this.developer,
    required this.platforms,
    required this.tags,
    required this.installTargets,
    required this.stars,
    required this.downloads,
    this.website,
    this.latestVersion,
    this.releasedAt,
  });

  static AppEntry fromJson(Map<String, dynamic> json) {
    final install = json['install'] as Map<String, dynamic>?;
    final id = (json['id'] as String?) ?? (json['name'] as String?) ?? '';
    return AppEntry(
      id: id,
      name: (json['name'] as String?) ?? id,
      tagline: json['tagline'] as String? ?? '',
      description: json['description'] as String? ?? '',
      category: json['category'] as String? ?? 'apps',
      repo: json['repo'] as String? ?? '',
      developer: Developer.fromJson((json['developer'] as Map<String, dynamic>?) ?? const {}),
      platforms:
          ((json['platforms'] as List?) ?? const []).cast<String>().toList(growable: false),
      tags: ((json['tags'] as List?) ?? const []).cast<String>().toList(growable: false),
      website: json['website'] as String?,
      latestVersion: json['latestVersion'] as String?,
      releasedAt: json['releasedAt'] as String?,
      installTargets: ((install?['targets'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(InstallTarget.fromJson)
          .toList(growable: false),
      stars: ((json['stats'] as Map<String, dynamic>?)?['stars'] as num?)?.toInt() ?? 0,
      downloads: ((json['stats'] as Map<String, dynamic>?)?['downloads'] as num?)?.toInt() ?? 0,
    );
  }

  bool supports(String platform) => platforms.contains(platform);

  InstallTarget? targetFor(String platform) {
    for (final target in installTargets) {
      if (target.platform == platform) return target;
    }
    return null;
  }

  Uri get repoUrl => Uri.parse('https://github.com/$repo');
  Uri get releasesUrl => Uri.parse('https://github.com/$repo/releases/latest');
}

@immutable
class Creator {
  final Developer developer;
  final List<AppEntry> apps;

  const Creator({required this.developer, required this.apps});

  String get name => developer.name;
  String get handle => developer.handle;
  int get downloads => apps.fold(0, (sum, app) => sum + app.downloads);
  int get stars => apps.fold(0, (sum, app) => sum + app.stars);
}

extension CatalogTrending on Catalog {
  /// Apps ranked by latest-release downloads.
  List<AppEntry> trendingApps({int limit = 8}) {
    final sorted = [...apps]..sort((a, b) => b.downloads.compareTo(a.downloads));
    return sorted.take(limit).toList(growable: false);
  }

  /// Apps with the most recent release dates, newest first.
  List<AppEntry> newestApps({int limit = 6}) {
    final sorted = [...apps]..sort((a, b) {
        final aDate = a.releasedAt ?? '';
        final bDate = b.releasedAt ?? '';
        return bDate.compareTo(aDate);
      });
    return sorted.take(limit).toList(growable: false);
  }

  List<Creator> creators() {
    final byHandle = <String, List<AppEntry>>{};
    for (final app in apps) {
      byHandle.putIfAbsent(app.developer.handle, () => []).add(app);
    }
    return byHandle.entries
        .map((entry) => Creator(developer: entry.value.first.developer, apps: entry.value))
        .toList(growable: false);
  }

  /// Creators ranked by total downloads across their published apps.
  List<Creator> trendingCreators({int limit = 8}) {
    final sorted = [...creators()]..sort((a, b) => b.downloads.compareTo(a.downloads));
    return sorted.take(limit).toList(growable: false);
  }

  List<String> get categories =>
      apps.map((app) => app.category).toSet().toList(growable: false);
}
