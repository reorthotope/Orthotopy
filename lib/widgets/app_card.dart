import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/catalog.dart';
import '../state/catalog_provider.dart';
import '../util/format.dart';
import '../util/platform.dart';
import 'app_avatar.dart';

/// Compact stat text with an icon prefix.
class Stat extends StatelessWidget {
  const Stat({super.key, required this.icon, required this.value, this.color});

  final IconData icon;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 3),
          Text(value, style: Theme.of(context).textTheme.labelSmall),
        ],
      );
}

/// The primary call to action: resolves the right GitHub Release asset for
/// the current (or explicitly given) platform and opens it, which triggers a
/// direct download in the browser / OS.
class InstallButton extends StatefulWidget {
  const InstallButton({
    super.key,
    required this.app,
    this.platform,
    this.compact = false,
  });

  final AppEntry app;
  final String? platform;
  final bool compact;

  @override
  State<InstallButton> createState() => _InstallButtonState();
}

class _InstallButtonState extends State<InstallButton> {
  bool _busy = false;

  Future<void> _install() async {
    setState(() => _busy = true);
    try {
      final provider = context.read<CatalogProvider>();
      final uri = await provider.resolver
          .resolve(widget.app, widget.platform ?? currentPlatformKey());
      if (uri != null && context.mounted) {
        await launchUrl(uri, mode: LaunchMode.platformDefault, webOnlyWindowName: '_blank');
      }
    } on Object {
      // The resolver already falls back to the release page; nothing else to do.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => FilledButton.tonalIcon(
        onPressed: _busy ? null : _install,
        icon: _busy
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.download_rounded, size: 16),
        label: Text(widget.compact ? 'Get' : 'Install'),
        style: FilledButton.styleFrom(
          visualDensity: VisualDensity.compact,
          padding: EdgeInsets.symmetric(horizontal: widget.compact ? 12 : 18),
        ),
      );
}

/// Secondary action: opens the repo's GitHub Releases page.
class ReleasesButton extends StatelessWidget {
  const ReleasesButton({super.key, required this.app});

  final AppEntry app;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: () => launchUrl(
          app.releasesUrl,
          mode: LaunchMode.platformDefault,
          webOnlyWindowName: '_blank',
        ),
        icon: const Icon(Icons.open_in_new_rounded, size: 16),
        label: const Text('GitHub Releases'),
        style: OutlinedButton.styleFrom(
          visualDensity: VisualDensity.compact,
          padding: const EdgeInsets.symmetric(horizontal: 18),
        ),
      );
}

/// Grid/list card used across Browse and creator pages.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.app, this.onOpen});

  final AppEntry app;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppAvatar(label: app.name, size: 38),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          app.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          app.developer.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall
                              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Stat(
                    icon: Icons.star_rounded,
                    value: formatCount(app.stars),
                    color: Colors.amber.shade600,
                  ),
                  const SizedBox(width: 10),
                  Stat(
                    icon: Icons.download_rounded,
                    value: formatCount(app.downloads),
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const Spacer(),
                  for (final platform in app.platforms.take(4))
                    Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: Icon(
                        platformIcon(platform),
                        size: 14,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Rank-badged card used in the Home "Trending apps" rail.
class TrendingAppCard extends StatelessWidget {
  const TrendingAppCard({
    super.key,
    required this.app,
    required this.rank,
    this.onOpen,
  });

  final AppEntry app;
  final int rank;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox(
      width: 252,
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    SizedBox(
                      width: 30,
                      child: Text(
                        '#$rank',
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    AppAvatar(label: app.name, size: 38),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        app.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: Text(
                    app.tagline,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      height: 1.25,
                    ),
                  ),
                ),
                Row(
                  children: [
                    Stat(
                      icon: Icons.download_rounded,
                      value: formatCount(app.downloads),
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const Spacer(),
                    InstallButton(app: app, compact: true),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
