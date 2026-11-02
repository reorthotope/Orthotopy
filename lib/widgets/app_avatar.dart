import 'dart:math' as math;

import 'package:flutter/material.dart';

const List<List<Color>> _palettes = [
  [Color(0xFF10B981), Color(0xFF064E3B)],
  [Color(0xFF34D399), Color(0xFF065F46)],
  [Color(0xFF22D3EE), Color(0xFF155E75)],
  [Color(0xFF818CF8), Color(0xFF3730A3)],
  [Color(0xFFF472B6), Color(0xFF831843)],
  [Color(0xFFFBBF24), Color(0xFF78350F)],
  [Color(0xFFF87171), Color(0xFF7F1D1D)],
  [Color(0xFFA78BFA), Color(0xFF4C1D95)],
];

/// Deterministic gradient avatar derived from the label — same app always
/// gets the same colors on every platform, no image assets needed.
class AppAvatar extends StatelessWidget {
  const AppAvatar({super.key, required this.label, this.size = 44, this.radius});

  final String label;
  final double size;
  final double? radius;

  @override
  Widget build(BuildContext context) {
    final palette = _palettes[label.hashCode.abs() % _palettes.length];
    final initial = label.isEmpty ? '?' : label[0].toUpperCase();
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius ?? size * 0.28),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: palette,
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.42,
        ),
      ),
    );
  }
}

/// The Orthotopy mark: an open orbit ring with the app sitting in its right
/// place. Painted with CustomPaint so it stays crisp on every platform.
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 40, this.color});

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => CustomPaint(
        size: Size.square(size),
        painter: _BrandMarkPainter(
          color: color ?? Theme.of(context).colorScheme.primary,
        ),
      );
}

class _BrandMarkPainter extends CustomPainter {
  _BrandMarkPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = size.shortestSide * 0.30;
    final startAngle = math.pi * 0.15;
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.shortestSide * 0.13
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle,
      math.pi * 1.7,
      false,
      stroke,
    );
    canvas.drawCircle(
      center + Offset.fromDirection(startAngle, radius),
      size.shortestSide * 0.09,
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(covariant _BrandMarkPainter oldDelegate) =>
      oldDelegate.color != color;
}
