import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orthotopy/main.dart';
import 'package:orthotopy/models/catalog.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
      "install": {"targets": []},
      "stats": {"stars": 10, "downloads": 1500}
    },
    {
      "id": "beta", "name": "Beta", "tagline": "Useful things",
      "category": "utilities", "repo": "o/beta",
      "developer": {"name": "Bob", "handle": "bob"},
      "platforms": ["windows"], "tags": [],
      "install": {"targets": []},
      "stats": {"stars": 5, "downloads": 3000}
    }
  ]
}
''';

Future<Catalog> _loadFixture() async =>
    Catalog.fromJson(jsonDecode(_fixture) as Map<String, dynamic>);

Finder _browseSearchField() => find.byWidgetPredicate(
      (widget) =>
          widget is TextField &&
          widget.decoration?.hintText == 'Search apps, games, creators…',
    );

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('home renders trending sections and app cards', (tester) async {
    await tester.pumpWidget(OrthotopyApp(loadCatalog: _loadFixture));
    await tester.pumpAndSettle();

    // Brand + section headers are visible.
    expect(find.text('Orthotopy'), findsWidgets);
    expect(find.text('Trending apps'), findsOneWidget);
    expect(find.text('Trending creators'), findsOneWidget);

    // Rank badges exist in both trending rails; the top app shows up.
    expect(find.text('#1'), findsWidgets);
    expect(find.text('Beta'), findsWidgets);
    expect(find.text('Alpha'), findsWidgets);
  });

  testWidgets('browse tab lists all apps and filters by search', (tester) async {
    await tester.pumpWidget(OrthotopyApp(loadCatalog: _loadFixture));
    await tester.pumpAndSettle();

    // Switch to Browse.
    await tester.tap(find.byIcon(Icons.apps_outlined).first);
    await tester.pumpAndSettle();
    expect(find.text('2 apps & games'), findsOneWidget);

    // Type a query.
    await tester.enterText(_browseSearchField(), 'alpha');
    await tester.pumpAndSettle();
    expect(find.text('1 app & games'), findsOneWidget);

    // No matches shows the empty state.
    await tester.enterText(_browseSearchField(), 'zzz-no-match');
    await tester.pumpAndSettle();
    expect(find.text('Nothing in its right place'), findsOneWidget);
  });
}
