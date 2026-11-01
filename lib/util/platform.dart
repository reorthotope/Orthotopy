import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

const Map<String, String> _platformLabels = {
  'android': 'Android',
  'ios': 'iOS',
  'windows': 'Windows',
  'macos': 'macOS',
  'linux': 'Linux',
  'web': 'Web',
};

String platformLabel(String key) => _platformLabels[key] ?? key;

IconData platformIcon(String key) => switch (key) {
      'android' => Icons.android,
      'ios' => Icons.phone_iphone,
      'windows' => Icons.desktop_windows,
      'macos' => Icons.desktop_mac,
      'linux' => Icons.computer,
      _ => Icons.language,
    };

/// The platform key used to pick the default install target.
/// iOS falls back to `web` (the release page) until native iOS builds ship.
String currentPlatformKey() {
  if (kIsWeb) return 'web';
  if (Platform.isAndroid) return 'android';
  if (Platform.isWindows) return 'windows';
  if (Platform.isMacOS) return 'macos';
  if (Platform.isLinux) return 'linux';
  return 'web';
}
