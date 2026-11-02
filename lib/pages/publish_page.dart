import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class PublishPage extends StatelessWidget {
  const PublishPage({super.key});

  static const String repoUrl = 'https://github.com/reorthotope/Orthotopy';
  static const String catalogUrl = '$repoUrl/blob/main/catalog/catalog.json';
  static const String editCatalogUrl = '$repoUrl/edit/main/catalog/catalog.json';
  static const String forkUrl = '$repoUrl/fork';
  static const String schemaUrl = '$repoUrl/blob/main/orthotopy.schema.json';

  static const String _example = '''
{
  "id": "my-app",
  "name": "My App",
  "tagline": "One line that sells it",
  "category": "utilities",
  "repo": "you/my-app",
  "developer": { "name": "You", "handle": "you" },
  "platforms": ["android", "linux"],
  "tags": ["tool"],
  "install": {
    "targets": [
      { "platform": "android", "assetRegex": "^my-app-.*\\\\.apk\$" }
    ]
  }
}''';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            title: Text(
              'Publish',
              style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 60),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                Text(
                  'Orthotopy is a pull-request store. If your builds live in GitHub '
                  'Releases, listing your app here takes one file edit — no accounts, '
                  'no fees, no review queues.',
                  style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
                ),
                const SizedBox(height: 20),
                _Step(
                  number: 1,
                  title: 'Ship it on GitHub',
                  body: 'Publish your project and attach a build for each platform '
                      '(APK, zip, tar.gz…) to a GitHub Release of your repository.',
                ),
                _Step(
                  number: 2,
                  title: 'Add it to the catalog',
                  body: 'Fork Orthotopy and append one JSON entry to '
                      'catalog/catalog.json. A regex matches your release asset '
                      'names, so the install button always downloads your latest '
                      'release automatically.',
                ),
                _Step(
                  number: 3,
                  title: 'Open a pull request',
                  body: 'Once merged, every Orthotopy client picks your app up on '
                      'its next launch — the catalog is fetched live from this '
                      'repo, so there is no store update to wait for.',
                ),
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.description_outlined,
                                size: 16, color: theme.colorScheme.primary),
                            const SizedBox(width: 8),
                            Text(
                              'catalog/catalog.json entry',
                              style: theme.textTheme.titleSmall
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: theme.brightness == Brightness.dark
                                ? const Color(0xFF07130E)
                                : const Color(0xFFF2F7F4),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: theme.dividerColor),
                          ),
                          child: SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            child: SelectableText(
                              _example,
                              style: theme.textTheme.bodySmall?.copyWith(
                                fontFamilyFallback: const ['monospace'],
                                height: 1.45,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _open(context, forkUrl),
                      icon: const Icon(Icons.fork_right_rounded, size: 16),
                      label: const Text('Fork the repo'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _open(context, editCatalogUrl),
                      icon: const Icon(Icons.edit_note_rounded, size: 16),
                      label: const Text('Edit catalog.json'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _open(context, schemaUrl),
                      icon: const Icon(Icons.rule_rounded, size: 16),
                      label: const Text('JSON schema'),
                    ),
                    OutlinedButton.icon(
                      onPressed: () => _open(context, catalogUrl),
                      icon: const Icon(Icons.list_alt_rounded, size: 16),
                      label: const Text('Browse the catalog'),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Text(
                  'Maintainers review pull requests and may ask for a signed build '
                  'or a demo. Only list software you have the right to distribute.',
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  void _open(BuildContext context, String url) {
    launchUrl(Uri.parse(url), mode: LaunchMode.platformDefault, webOnlyWindowName: '_blank');
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.title, required this.body});

  final int number;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              radius: 14,
              backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.16),
              child: Text(
                '$number',
                style: theme.textTheme.labelLarge
                    ?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(
                    body,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
