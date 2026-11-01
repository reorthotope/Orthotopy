import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:orthotopy/models/catalog.dart';
import 'package:orthotopy/util/format.dart';

const String _fixture = '''
{
  "schemaVersion": 1,
  "updatedAt": "2026-11-01",
  "apps": [
    {
      "id": "alpha", "name": "Alpha", "tagline": "Fast things",
      "description": "Alpha description.", "category": "games",
      "repo": "o/alpha", "developer": {"name": "Ann", "handle": "ann"},
      "platforms": ["android", "linux"], "tags": ["fun"],
      "latestVersion": "v1.2.0", "releasedAt": "2026-10-01",
      "install": {"targets": [
        {"platform": "android", "assetRegex": "^alpha-.*\\\\.apk\$"}
      ]},
      "stats": {"stars": 10, "downloads": 1500}
    },
    {
      "id": "beta", "name": "Beta", "tagline": "Useful things",
      "category": "utilities", "repo": "o/beta",
      "developer": {"name": "Ann", "handle": "ann"},
      "platforms": ["windows"], "tags": [],
      "install": {"targets": []},
      "stats": {"stars": 5, "downloads": 3000}
    },
    {
      "id": "gamma", "name": "Gamma", "tagline": "Slow things",
      "category": "games", "repo": "o/gamma",
      "developer": {"name": "Bob", "handle": "bob"},
      "platforms": ["linux"], "tags": [],
      "install": {"targets": []},
      "stats": {"stars": 7, "downloads": 900}
    }
  ]
}
''';

Catalog _parse() =>
    Catalog.fromJson(jsonDecode(_fixture) as Map<String, dynamic>);

void main() {
  group('Catalog parsing', () {
    test('parses apps with stats and install targets', () {
      final catalog = _parse();
      expect(catalog.apps.length, 3);
      expect(catalog.schemaVersion, 1);
      final alpha = catalog.apps.first;
      expect(alpha.id, 'alpha');
      expect(alpha.developer.handle, 'ann');
      expect(alpha.stars, 10);
      expect(alpha.downloads, 1500);
      expect(alpha.supports('android'), isTrue);
      expect(alpha.supports('ios'), isFalse);
      expect(alpha.targetFor('android')?.assetRegex, '^alpha-.*\\.apk\$');
      expect(alpha.targetFor('web'), isNull);
      expect(alpha.repoUrl.toString(), 'https://github.com/o/alpha');
      expect(alpha.releasesUrl.toString(), 'https://github.com/o/alpha/releases/latest');
    });

    test('survives malformed / missing fields', () {
      final catalog = Catalog.fromJson(
          jsonDecode('{"apps": [{}]}') as Map<String, dynamic>);
      expect(catalog.apps.length, 1);
      expect(catalog.apps.first.id, '');
      expect(catalog.apps.first.downloads, 0);
    });
  });

  group('Trending', () {
    test('trendingApps sorts by downloads descending', () {
      final names = _parse().trendingApps().map((a) => a.name).toList();
      expect(names, ['Beta', 'Alpha', 'Gamma']);
    });

    test('newestApps sorts by release date descending', () {
      final names = _parse().newestApps().map((a) => a.name).toList();
      expect(names, ['Alpha', 'Beta', 'Gamma']);
    });

    test('creators aggregate downloads and stars per handle', () {
      final creators = _parse().trendingCreators();
      expect(creators.length, 2);
      expect(creators.first.name, 'Ann');
      expect(creators.first.apps.length, 2);
      expect(creators.first.downloads, 4500);
      expect(creators.first.stars, 15);
      expect(creators.last.handle, 'bob');
    });

    test('categories are distinct', () {
      expect(_parse().categories, containsAll(['games', 'utilities']));
    });
  });

  group('Filters (provider logic)', () {
    test('formatCount compact rendering', () {
      expect(formatCount(900), '900');
      expect(formatCount(1500), '1.5k');
      expect(formatCount(3000), '3.0k');
      expect(formatCount(15400), '15k');
      expect(formatCount(2000000), '2.0M');
      expect(formatCount(4907730), '4.9M');
    });
  });
}
