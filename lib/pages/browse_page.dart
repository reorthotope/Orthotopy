import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/catalog.dart';
import '../state/catalog_provider.dart';
import '../util/format.dart';
import '../widgets/app_card.dart';
import 'detail_page.dart';

class BrowsePage extends StatefulWidget {
  const BrowsePage({super.key});

  @override
  State<BrowsePage> createState() => _BrowsePageState();
}

class _BrowsePageState extends State<BrowsePage> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: context.read<CatalogProvider>().query);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final query = context.watch<CatalogProvider>().query;
    if (query != _controller.text) {
      _controller.text = query;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<CatalogProvider>();
    final catalog = provider.catalog;
    final results = provider.filteredApps();
    final theme = Theme.of(context);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            floating: true,
            snap: true,
            title: Text(
              'Browse',
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            sliver: SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _controller,
                    onChanged: provider.setQuery,
                    decoration: InputDecoration(
                      hintText: 'Search apps, games, creators…',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: provider.query.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close_rounded, size: 18),
                              onPressed: () => provider.setQuery(''),
                            ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (catalog != null)
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        ChoiceChip(
                          label: const Text('All'),
                          selected: provider.category == 'all',
                          onSelected: (_) => provider.setCategory('all'),
                        ),
                        for (final category in catalog.categories)
                          ChoiceChip(
                            label: Text(categoryLabel(category)),
                            selected: provider.category == category,
                            onSelected: (_) => provider.setCategory(category),
                          ),
                      ],
                    ),
                  const SizedBox(height: 12),
                  Text(
                    '${results.length} app${results.length == 1 ? '' : 's'} & games',
                    style: theme.textTheme.labelMedium
                        ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ),
          if (results.isEmpty)
            SliverFillRemaining(
              hasScrollBody: false,
              child: _EmptyState(onClear: () {
                provider.setQuery('');
                provider.setCategory('all');
              }),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 430,
                  mainAxisExtent: 100,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                ),
                delegate: SliverChildBuilderDelegate(
                  childCount: results.length,
                  (context, index) => AppCard(
                    app: results[index],
                    onOpen: () => _openDetail(context, results[index]),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _openDetail(BuildContext context, AppEntry app) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => DetailPage(app: app)),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onClear});

  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.search_off_rounded, size: 44, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(height: 12),
          Text('Nothing in its right place', style: theme.textTheme.titleMedium),
          const SizedBox(height: 4),
          Text(
            'No apps match your search or filter.',
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: onClear, child: const Text('Clear filters')),
        ],
      ),
    );
  }
}
