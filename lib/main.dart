import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'data/catalog_repository.dart';
import 'models/catalog.dart';
import 'state/catalog_provider.dart';
import 'theme.dart';
import 'widgets/adaptive_shell.dart';

void main() {
  runApp(const OrthotopyApp());
}

class OrthotopyApp extends StatelessWidget {
  const OrthotopyApp({super.key, this.repository, this.loadCatalog});

  /// Production repository; tests can inject their own.
  final CatalogRepository? repository;

  /// Optional catalog loader override (used by widget tests).
  final Future<Catalog> Function()? loadCatalog;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<CatalogRepository>.value(value: repository ?? CatalogRepository()),
        ChangeNotifierProvider<ThemeController>(
          create: (_) => ThemeController()..restore(),
        ),
        ChangeNotifierProvider<ShellController>(create: (_) => ShellController()),
        ChangeNotifierProvider<CatalogProvider>(
          create: (context) => CatalogProvider(
            loadCatalog: loadCatalog ?? () => context.read<CatalogRepository>().load(),
          )..load(),
        ),
      ],
      child: Consumer<ThemeController>(
        builder: (context, theme, _) => MaterialApp(
          title: 'Orthotopy',
          debugShowCheckedModeBanner: false,
          theme: OrthotopyTheme.light(),
          darkTheme: OrthotopyTheme.dark(),
          themeMode: theme.mode,
          home: const AdaptiveShell(),
        ),
      ),
    );
  }
}
