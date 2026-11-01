import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/catalog.dart';
import '../state/catalog_provider.dart';
import '../util/format.dart';
import '../widgets/app_avatar.dart';
import '../widgets/app_card.dart';
import 'detail_page.dart';

class CreatorsPage extends StatelessWidget {
  const CreatorsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<CatalogProvider>();
    final catalog = provider.catalog;
    final theme = Theme.of(context);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            title: Text(
              'Creators',
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            sliver: SliverToBoxAdapter(
              child: Text(
                'The people and teams behind the catalog, ranked by total downloads.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
          if (provider.loading)
            const SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: CircularProgressIndicator()),
            )
          else if (catalog != null)
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
              sliver: SliverList(
                delegate: SliverChildBuilderDelegate(
                  childCount: catalog.trendingCreators(limit: 24).length,
                  (context, index) {
                    final creator = catalog.trendingCreators(limit: 24)[index];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: RankedCreatorTile(creator: creator, rank: index + 1),
                    );
                  },
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Ranked row used on the Creators tab.
class RankedCreatorTile extends StatelessWidget {
  const RankedCreatorTile({super.key, required this.creator, required this.rank});

  final Creator creator;
  final int rank;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => CreatorPage(creator: creator)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              SizedBox(
                width: 34,
                child: Text(
                  '#$rank',
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: theme.colorScheme.primary,
                  ),
                ),
              ),
              AppAvatar(label: creator.name, size: 46, radius: 23),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      creator.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${creator.apps.length} app${creator.apps.length == 1 ? '' : 's'}'
                      ' · ${formatCount(creator.downloads)} downloads'
                      ' · ★ ${formatCount(creator.stars)}',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}

/// Compact rail card used on Home ("Trending creators").
class CreatorChip extends StatelessWidget {
  const CreatorChip({super.key, required this.creator, required this.rank});

  final Creator creator;
  final int rank;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: 176,
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => Navigator.of(context).push(
            MaterialPageRoute<void>(builder: (_) => CreatorPage(creator: creator)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Row(
                  children: [
                    Text(
                      '#$rank',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '★ ${formatCount(creator.stars)}',
                      style: theme.textTheme.labelSmall
                          ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                AppAvatar(label: creator.name, size: 44, radius: 22),
                const SizedBox(height: 8),
                Text(
                  creator.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(
                  '${formatCount(creator.downloads)} downloads',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CreatorPage extends StatelessWidget {
  const CreatorPage({super.key, required this.creator});

  final Creator creator;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(creator.name)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              AppAvatar(label: creator.name, size: 56, radius: 28),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '@${creator.handle}',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    Text(
                      '${creator.apps.length} apps · ${formatCount(creator.downloads)} downloads'
                      ' · ★ ${formatCount(creator.stars)} stars',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          for (final app in creator.apps)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SizedBox(
                height: 100,
                child: AppCard(
                  app: app,
                  onOpen: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(builder: (_) => DetailPage(app: app)),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
