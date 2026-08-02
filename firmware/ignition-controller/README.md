# Programmable CDI Ignition Controller

Single-cylinder ignition timing controller for **Arduino Nano v3** (ATmega328P @ 16 MHz).

A Hall sensor triggers once per revolution at a fixed physical position BTDC. The
controller measures the revolution period, looks up the target advance for the
current RPM, and schedules the SCR gate pulse `(SENSOR_ANGLE - advance)` degrees later.

## Wiring

| Pin | Signal | Notes |
|---|---|---|
| D2 | Hall sensor | INT0, falling edge. **Add an external 1k–4.7k pull-up to 5V** |
| D4 | SCR gate driver | PD4, 25 µs active-high pulse. **Add an external 1k pulldown to GND** |
| D7 | Map select switch | Internal pull-up. Open = Curve 1, closed to ground = Curve 2 |

### Required external parts

These two resistors are not optional:

- **D2 pull-up (1k–4.7k to 5V).** Most Hall ICs are open-collector. The AVR's
  internal pull-up is 20–50 kΩ, which against a metre of cable capacitance gives
  a multi-microsecond rise time — slow edges next to an HT lead invite double
  triggering.
- **D4 pulldown (1k to GND).** All AVR pins are high-Z during reset, so the SCR
  gate floats and can self-trigger on ignition noise. Firmware cannot cover this
  window; only the resistor can.

Use a **non-latching (unipolar) Hall** with a single magnet. A latching type
(US1881) needs alternating N/S poles — with one magnet it latches on and never
produces a second edge.

### Power

Feed the board from a **switching buck converter (MP1584/LM2596) into the 5V
pin**, not VIN. The onboard regulator is rated 7–12 V with a 15 V absolute
maximum; a 3S Li-ion pack is 12.6 V full and 4S LiFePO4 reaches 14.6 V on
charge, which leaves no headroom for transients and wastes the difference as
heat.

Also recommended for a battery-fed ignition system:

- Reverse-polarity protection (series Schottky or P-FET).
- TVS across the supply — SMBJ16A for 3S, SMBJ18A for 4S.
- 470–1000 µF bulk plus 100 nF at the converter input, and 100 nF at the Nano's 5V/GND.
- **Enable the BOD fuse at 2.7 V.** Many Nano clones ship with brown-out
  detection disabled. A pack sagging under crank can otherwise drop the rail
  into the range where the MCU executes garbage instead of resetting cleanly.
- Run the Hall lead in shielded cable, shield grounded at the Arduino end only.

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
| Plausibility gate | 0.5× | Edge implying >2× speed increase in one rev is rejected as EMI |
| Minimum RPM | 100 | No spark below this |
| Rev limiter | 11000 RPM | Hard spark cut, resumes below 10700 (hysteresis) |
| Stall timeout | 1 s | Clears RPM readout and drops crank sync |
| Watchdog | 250 ms | Resets on a hung main loop |

Rejected edges do **not** commit the reference timestamp, so a spike cannot skew
the following measurement. Simulated across spike offsets from 2.7–10 ms, none
disturbed the next genuine edge's RPM. After 3 consecutive rejections the
controller assumes sync was genuinely lost and resyncs rather than locking the
spark out indefinitely.

## Trigger latency compensation

`TRIGGER_LATENCY_US` (default **0**) is subtracted from the scheduled delay to
cancel Hall propagation delay plus AVR interrupt latency. This is a fixed
*time*, so as an *angle* it grows with RPM and always retards the spark:

| RPM | 10 µs of latency |
|---|---|
| 1,200 | 0.07° |
| 6,500 | 0.39° |
| 11,000 | 0.66° |

To use it, take the output propagation delay from your Hall sensor's datasheet
(typically 3–10 µs), add ~3 µs of interrupt latency, and verify with a timing
light afterwards.

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
