import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/catalog.dart';
import '../util/format.dart';
import '../util/platform.dart';
import '../widgets/app_avatar.dart';
import '../widgets/app_card.dart';

class DetailPage extends StatelessWidget {
  const DetailPage({super.key, required this.app});

  final AppEntry app;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final wide = MediaQuery.sizeOf(context).width >= 880;

    final sidebar = Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        AppAvatar(label: app.name, size: 96, radius: 24),
        const SizedBox(height: 14),
        Text(
          app.name,
          textAlign: TextAlign.center,
          style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text(
          app.developer.name,
          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.primary),
        ),
        const SizedBox(height: 6),
        Text(
          app.tagline,
          textAlign: TextAlign.center,
          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stat(
              icon: Icons.star_rounded,
              value: formatCount(app.stars),
              color: Colors.amber.shade600,
            ),
            const SizedBox(width: 16),
            Stat(
              icon: Icons.download_rounded,
              value: formatCount(app.downloads),
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ],
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 44,
          child: InstallButton(app: app),
        ),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, height: 40, child: ReleasesButton(app: app)),
        const SizedBox(height: 20),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Available for',
            style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
        ),
        const SizedBox(height: 8),
        Align(
          alignment: Alignment.centerLeft,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final platform in app.platforms)
                Chip(
                  avatar: Icon(platformIcon(platform), size: 15),
                  label: Text(platformLabel(platform)),
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
        ),
      ],
    );

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _Panel(
          title: 'About',
          child: SelectableText(
            app.description,
            style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
          ),
        ),
        if (app.latestVersion != null)
          _Panel(
            title: "What's new",
            child: Row(
              children: [
                Icon(Icons.new_releases_rounded, size: 16, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  '${app.latestVersion}'
                  '${app.releasedAt != null ? '  ·  ${app.releasedAt}' : ''}',
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        _Panel(
          title: 'Install on…',
          child: Column(
            children: [
              for (final platform in app.platforms)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Icon(platformIcon(platform), size: 18, color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 12),
                      Expanded(child: Text(platformLabel(platform))),
                      InstallButton(app: app, platform: platform, compact: true),
                    ],
                  ),
                ),
              Text(
                'Install opens the matching GitHub Release asset and your browser downloads it directly.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        if (app.tags.isNotEmpty)
          _Panel(
            title: 'Tags',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final tag in app.tags) Chip(label: Text(tag), visualDensity: VisualDensity.compact),
              ],
            ),
          ),
        _Panel(
          title: 'Source',
          child: Row(
            children: [
              Icon(Icons.code_rounded, size: 16, color: theme.colorScheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'github.com/${app.repo}',
                  style: theme.textTheme.bodyMedium?.copyWith(fontFamilyFallback: const ['monospace']),
                ),
              ),
              IconButton(
                tooltip: 'Open repository',
                onPressed: () => launchUrl(
                  app.repoUrl,
                  mode: LaunchMode.platformDefault,
                  webOnlyWindowName: '_blank',
                ),
                icon: const Icon(Icons.open_in_new_rounded, size: 18),
              ),
            ],
          ),
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(app.name),
        actions: [
          if (!wide) InstallButton(app: app, compact: true),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1120),
            child: wide
                ? Padding(
                    padding: const EdgeInsets.all(24),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(width: 340, child: sidebar),
                        const SizedBox(width: 24),
                        Expanded(child: content),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.all(24),
                    children: [sidebar, const SizedBox(height: 24), content],
                  ),
          ),
        ),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }
}
