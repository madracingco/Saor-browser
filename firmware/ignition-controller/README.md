# Programmable CDI Ignition Controller

Single-cylinder ignition timing controller for **Arduino Nano v3** (ATmega328P @ 16 MHz).

A Hall sensor triggers once per revolution at a fixed physical position BTDC. The
controller measures the revolution period, looks up the target advance for the
current RPM, and schedules the SCR gate pulse `(SENSOR_ANGLE - advance)` degrees later.

## Wiring

| Pin | Signal | Notes |
|---|---|---|
| D2 | Hall sensor | INT0, falling edge, internal pull-up |
| D4 | SCR gate driver | PD4, 25 µs active-high trigger pulse |
| D7 | Map select switch | Internal pull-up. Open = Curve 1, closed to ground = Curve 2 |

`SENSOR_ANGLE` (default 35.0°) **must** match the sensor's real physical position
BTDC. The spark can only ever be scheduled *after* this point, so no map may
request advance at or beyond it — `buildDelayTable()` caps anything that does.

## Curves

| | Curve 1 (D7 open) | Curve 2 (D7 grounded) |
|---|---|---|
| Use | Dry track / max power | Wet, mud, detonation protection |
| Peak advance | 24° @ 6500 RPM | 20° @ 6500 RPM |

Curves are defined as RPM/advance breakpoints and linearly interpolated.

## Operating limits

| Limit | Value | Behaviour |
|---|---|---|
| Noise debounce | 2700 µs | Edges closer than this are rejected (~22,200 RPM) |
| Minimum RPM | 100 | No spark below this |
| Rev limiter | 11000 RPM | Hard spark cut, resumes below 10700 (hysteresis) |
| Stall timeout | 1 s | Clears RPM readout and drops crank sync |

## Timing implementation

Timer1 free-runs at /64 — **4 µs per tick, 262.1 ms per wrap**. The spark is
scheduled as an absolute compare target relative to `TCNT1` captured at the
sensor edge, so time spent computing inside the ISR is absorbed instead of
being added to the delay as extra retard.

The float curve interpolation runs once at boot into a fixed-point lookup table
(128 RPM per bin, interpolated between bins). The ISR does one table lookup and
one 32-bit multiply/divide — no floating point per revolution. Worst deviation
from the ideal curve is under 0.3° across the whole range.

### Why not prescaler /8

`/8` gives 0.5 µs resolution but only a **32.77 ms** range. At low RPM the delay
exceeds that and the 16-bit tick count silently wraps: at 101 RPM the spark
lands at 34.7° BTDC instead of the intended 15° — a **+19.9° over-advance**,
right in the kickback window during a slow kick or pull start. `/64` covers the
full range in one prescaler setting, and its 4 µs quantisation is only 0.26° even
at 11,000 RPM.

## Building

Open in the Arduino IDE (board: *Arduino Nano*, processor: *ATmega328P*) and upload.

Syntax/size check without the IDE:

```bash
avr-g++ -mmcu=atmega328p -DF_CPU=16000000UL -Os -std=gnu++11 -Wall -Wextra \
  -x c++ ignition-controller.ino -c -o /tmp/out.o
```

> **Safety:** this drives a live ignition system. Verify the fired angle with a
> timing light against a degree wheel before running the engine under load.
