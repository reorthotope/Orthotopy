import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../pages/browse_page.dart';
import '../pages/creators_page.dart';
import '../pages/home_page.dart';
import '../pages/publish_page.dart';
import '../state/catalog_provider.dart';
import 'app_avatar.dart';

/// Adaptive navigation: bottom NavigationBar on phones, a NavigationRail on
/// wide desktop/web windows. All four tabs live in an IndexedStack so state
/// (scroll positions, filters) survives tab switches.
class AdaptiveShell extends StatefulWidget {
  const AdaptiveShell({super.key});

  @override
  State<AdaptiveShell> createState() => _AdaptiveShellState();
}

class _AdaptiveShellState extends State<AdaptiveShell> {
  static const List<Widget> _pages = [
    HomePage(),
    BrowsePage(),
    CreatorsPage(),
    PublishPage(),
  ];

  int _index = 0;
  ShellController? _shell;

  @override
  void initState() {
    super.initState();
    _shell = context.read<ShellController>();
    _shell!.addListener(_handleShellChange);
  }

  @override
  void dispose() {
    _shell?.removeListener(_handleShellChange);
    super.dispose();
  }

  void _handleShellChange() {
    final shell = _shell!;
    if (!mounted) return;
    setState(() => _index = shell.index);
    if (shell.index == 1 && shell.pendingQuery.isNotEmpty) {
      context.read<CatalogProvider>().setQuery(shell.pendingQuery);
      shell.consumePendingQuery();
    }
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 900;
    final extended = width >= 1240;
    final theme = Theme.of(context);

    final destinations = const [
      (Icons.home_outlined, Icons.home_rounded, 'Home'),
      (Icons.apps_outlined, Icons.apps_rounded, 'Browse'),
      (Icons.groups_outlined, Icons.groups_rounded, 'Creators'),
      (Icons.rocket_launch_outlined, Icons.rocket_launch_rounded, 'Publish'),
    ];

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              extended: extended,
              selectedIndex: _index,
              onDestinationSelected: (i) => context.read<ShellController>().go(i),
              labelType: extended ? null : NavigationRailLabelType.all,
              leading: Padding(
                padding: const EdgeInsets.symmetric(vertical: 18),
                child: extended
                    ? Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const SizedBox(width: 16),
                          const BrandMark(size: 34),
                          const SizedBox(width: 10),
                          Text(
                            'Orthotopy',
                            style: theme.textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(width: 24),
                        ],
                      )
                    : const BrandMark(size: 34),
              ),
              destinations: [
                for (final d in destinations)
                  NavigationRailDestination(
                    icon: Icon(d.$1),
                    selectedIcon: Icon(d.$2),
                    label: Text(d.$3),
                  ),
              ],
            ),
            VerticalDivider(width: 1, thickness: 1, color: theme.dividerColor),
            Expanded(child: IndexedStack(index: _index, children: _pages)),
          ],
        ),
      );
    }

    return Scaffold(
      body: IndexedStack(index: _index, children: _pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => context.read<ShellController>().go(i),
        destinations: [
          for (final d in destinations)
            NavigationDestination(icon: Icon(d.$1), selectedIcon: Icon(d.$2), label: d.$3),
        ],
      ),
    );
  }
}
