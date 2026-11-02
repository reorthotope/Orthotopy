import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import 'creators_page.dart' show CreatorChip;
import 'detail_page.dart';

import '../models/catalog.dart';
import '../state/catalog_provider.dart';
import '../util/format.dart';
import '../widgets/app_avatar.dart';
import '../widgets/app_card.dart';
import '../widgets/section_header.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<CatalogProvider>();
    final catalog = provider.catalog;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: provider.refresh,
        child: CustomScrollView(
          slivers: [
            SliverAppBar.large(
              title: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const BrandMark(size: 30),
                  const SizedBox(width: 10),
                  Text(
                    'Orthotopy',
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ],
              ),
              actions: [
                IconButton(
                  tooltip: 'Toggle theme',
                  onPressed: () => context.read<ThemeController>().toggle(),
                  icon: const Icon(Icons.brightness_6_outlined),
                ),
                IconButton(
                  tooltip: 'View source on GitHub',
                  onPressed: () => launchUrl(
                    Uri.parse('https://github.com/reorthotope/Orthotopy'),
                    mode: LaunchMode.platformDefault,
                    webOnlyWindowName: '_blank',
                  ),
                  icon: const Icon(Icons.code_rounded),
                ),
                const SizedBox(width: 4),
              ],
            ),
            if (provider.loading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CircularProgressIndicator()),
              )
            else if (provider.error != null)
              SliverFillRemaining(
                hasScrollBody: false,
                child: _ErrorView(onRetry: provider.load),
              )
            else if (catalog != null) ...[
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                sliver: SliverToBoxAdapter(child: _SearchCard()),
              ),
              const SectionHeader(title: 'Trending apps', icon: Icons.local_fire_department_rounded),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 210,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    scrollDirection: Axis.horizontal,
                    itemCount: catalog.trendingApps(limit: 10).length,
                    separatorBuilder: (_, _) => const SizedBox(width: 12),
                    itemBuilder: (context, index) {
                      final app = catalog.trendingApps(limit: 10)[index];
                      return TrendingAppCard(
                        app: app,
                        rank: index + 1,
                        onOpen: () => _openDetail(context, app),
                      );
                    },
                  ),
                ),
              ),
              const SectionHeader(title: 'Trending creators', icon: Icons.workspace_premium_rounded),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: 170,
                  child: Builder(builder: (context) {
                    final creators = catalog.trendingCreators(limit: 10);
                    return ListView.separated(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      scrollDirection: Axis.horizontal,
                      itemCount: creators.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 12),
                      itemBuilder: (context, index) =>
                          CreatorChip(creator: creators[index], rank: index + 1),
                    );
                  }),
                ),
              ),
              const SectionHeader(title: 'Categories', icon: Icons.category_rounded),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final category in catalog.categories)
                        ActionChip(
                          label: Text(
                            '${categoryLabel(category)} · '
                            '${catalog.apps.where((a) => a.category == category).length}',
                          ),
                          onPressed: () {
                            context.read<CatalogProvider>().setCategory(category);
                            context.read<ShellController>().go(1);
                          },
                        ),
                    ],
                  ),
                ),
              ),
              const SectionHeader(title: 'Fresh releases', icon: Icons.fiber_new_rounded),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                    maxCrossAxisExtent: 430,
                    mainAxisExtent: 100,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    childCount: catalog.newestApps(limit: 6).length,
                    (context, index) {
                      final app = catalog.newestApps(limit: 6)[index];
                      return AppCard(app: app, onOpen: () => _openDetail(context, app));
                    },
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 40),
                sliver: SliverToBoxAdapter(
                  child: Center(
                    child: Text(
                      'Catalog updated ${catalog.updatedAt} · Powered by GitHub Releases',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                    ),
                  ),
                ),
              ),
            ]
          ],
        ),
      ),
    );
  }

  void _openDetail(BuildContext context, AppEntry app) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => DetailPage(app: app)),
    );
  }
}

class _SearchCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TextField(
      readOnly: true,
      onTap: () => context.read<ShellController>().goBrowse(),
      decoration: InputDecoration(
        hintText: 'Search apps & games…',
        prefixIcon: const Icon(Icons.search_rounded),
        suffixIcon: Padding(
          padding: const EdgeInsets.only(right: 8),
          child: Icon(Icons.arrow_forward_rounded, size: 18, color: theme.colorScheme.onSurfaceVariant),
        ),
        suffixIconConstraints: const BoxConstraints(minWidth: 36, minHeight: 36),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.wifi_off_rounded, size: 44, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text('Could not load the catalog', style: theme.textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'Check your connection and try again.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh_rounded),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
