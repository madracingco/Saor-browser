# Programmable CDI Ignition Controller

Single-cylinder ignition timing controller for **Arduino Nano v3** (ATmega328P @ 16 MHz).

A Hall sensor triggers once per revolution at a fixed physical position BTDC. The
controller measures the revolution period, looks up the target advance for the
current RPM, and schedules the SCR gate pulse `(SENSOR_ANGLE - advance)` degrees later.

## Wiring

| Pin | Signal | Notes |
|---|---|---|
| D2 | Hall sensor | INT0, falling edge. **Add an external 1k–4.7k pull-up to 5V** |
| D4 | Gate driver input | PD4, 10 µs active-high into UCC27517. **Add an external 1k pulldown to GND** |
| D7 | Map select switch | Internal pull-up. Open = Curve 1, closed to ground = Curve 2 |
| D8 | Charge ready | PB0, from LT3751 `DONE`. Internal pull-up; unwired reads "ready" |

### Required external parts

These two resistors are not optional:

- **D2 pull-up (1k–4.7k to 5V).** Most Hall ICs are open-collector. The AVR's
  internal pull-up is 20–50 kΩ, which against a metre of cable capacitance gives
  a multi-microsecond rise time — slow edges next to an HT lead invite double
  triggering.
- **D4 pulldown (1k to GND).** All AVR pins are high-Z during reset, so the gate
  driver input floats and can self-trigger on ignition noise. Firmware cannot
  cover this window; only the resistor can.

The specified **Allegro A1101LUA** is a unipolar (non-latching) switch, so a
single magnet gives one clean edge per revolution, and its −40 to +150 °C range
suits an engine bay. Do not substitute a latching type such as the US1881 — that
needs alternating N/S poles, and with one magnet it latches on and never produces
a second edge, which presents as an engine that simply will not run.

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

## CDI power stage

Specified for a **400 V rail into 1.1 µF — 88 mJ per spark**, sustained to the
11,000 RPM limiter. The two decisions that drive everything else are that rail
energy and the choice to drive the SCR through an **isolated gate transformer**
rather than straight off a pin.

| Block | Part | Key spec |
|---|---|---|
| Charger controller | **ADI LT3751** | Flyback capacitor charger, programmable to 500 V, `DONE` output |
| Flyback transformer | 1:10, ≥20 W pulse rating | Per LT3751 datasheet table (Würth / Coilcraft matched parts) |
| Primary switch | 150–200 V logic-level N-MOSFET | e.g. IRFB4615 — sees V<sub>in</sub> + V<sub>out</sub>/N ≈ 52 V plus leakage |
| HV rectifier | **MUR1100E** | 1000 V, 1 A ultrafast |
| Discharge capacitor | **5 × 0.22 µF / 1000 VDC MKP, paralleled** = 1.1 µF | WIMA MKP10 0.22 µF/1000 V — see below |
| SCR | **ST TYN1225RG** | 25 A, 1200 V, I<sub>TSM</sub> 250 A, TO-220AB |
| Gate driver | **TI UCC27517** + 1:1 pulse transformer | 4 A peak, 5 V logic input; isolates MCU from the 400 V stage |
| Coil | **MSD 8223 Blaster HVC** | 0.7 Ω primary, specified by MSD for CD ignition systems |
| Hall sensor | **Allegro A1101LUA** | Unipolar (non-latching) switch, open-drain, −40 to +150 °C |

### Why five capacitors instead of one

The discharge is an LC ring, so peak dV/dt is V·ω, **not** V divided by rise time —
the crude figure understates it by π/2:

```
ω = 1/√(LC) = 1.35e5 rad/s      dV/dt = 400 × ω = 53.9 V/µs
```

A capacitor's dV/dt rating is really a peak-current rating in disguise
(I = C·dV/dt), and the limit is current through the end-spray and electrode
contacts. A single 1 µF part would have to carry the full **57 A**, which sits
right at the edge of what a 1 µF MKP part will do. Five 0.22 µF parts see the
same 54 V/µs but split the current **11.9 A each**, well inside the rating of
small-value MKP — and paralleling drops ESL about fivefold, which sharpens the
rise as a bonus. 1000 V parts on a 400 V rail is 2.5× derating.

Mount them as a tight cluster with short, wide copper to the SCR and coil; the
loop area of the discharge path matters more than any single component here.

### Why isolated gate drive

Driving the SCR gate directly from PD4 would have forced two constraints: the
SCR cathode must sit at MCU ground (low-side only), and the device must be a
sensitive-gate type whose I<sub>GT</sub> fits an AVR pin's ~20 mA budget. Those
rule out any SCR with a serious dI/dt rating, which is the parameter that
actually matters when 59 A appears in under 12 µs.

The UCC27517 into a 1:1 pulse transformer removes both constraints, delivers a
fast, hard gate pulse, and keeps the MCU galvanically clear of the 400 V stage —
the single biggest reliability risk in a system this electrically noisy.

**This is why `GATE_PULSE_US` is 10, not 25.** The pulse transformer's
volt-second product is the binding limit: 5 V × 10 µs = 50 V·µs, roughly half the
specified part's rating. The SCR itself only needs 1–2 µs to turn on and then
self-commutates below holding current, so 10 µs is already generous. **Raising it
saturates the transformer.**

### Energy and recharge budget

| Quantity | Value |
|---|---|
| Energy per spark | ½CV² = **88 mJ** |
| Sparks/second at limiter | 11,000 / 60 = **183.3** |
| Charger output power | **16.1 W** |
| Draw from 12 V at ~80% efficiency | **≈ 1.7 A** |
| Time available between sparks | **5.45 ms** at 11,000 RPM, 9.23 ms at 6,500 |
| Peak primary current | V·√(C/L) = **≈ 59 A** (11.9 A per capacitor) |
| Peak dV/dt | V/√(LC) = **≈ 54 V/µs** |
| Discharge rise time | (π/2)·√(LC) = **≈ 11.7 µs** |
| Secondary output | 400 V × ~100:1 ≈ **40 kV** |

That 1.7 A is on top of the Nano and is the dominant load — size the pack wiring,
fusing and the buck converter for it. Discharge takes ~12 µs against 5.45 ms
between sparks at the limiter, a ~460× margin, so the ring is over long before
the next revolution regardless of coil tolerance.

### Charge-ready interlock

The LT3751's `DONE` output goes to **D8**, which is why this part was chosen over
a generic UC3845 flyback: the interlock comes free with the controller.

The firmware **fires regardless** of `DONE` — a weak spark beats a guaranteed
misfire — but counts under-charged sparks, readable via `readWeakSparks()`. A
count that climbs with revs means the charger is not keeping up with the rate
being asked of it. Set `USE_CHARGE_READY` to 0 if the line is not wired; the pin
uses the internal pull-up, so a disconnected input reads "ready" and stays quiet.

### Why this coil

Capacitor and coil **primary inductance** form the discharge tank, so the coil
must be a capacitive-discharge type. Much of the inductive/Kettering range has a
primary inductance one to two orders of magnitude too high, which stretches rise
time and collapses peak current:

| Primary inductance | Rise time (1.1 µF) | Peak primary current at 400 V |
|---|---|---|
| 50 µH (CD type) | ~12 µs | ~59 A |
| 5 mH (inductive type) | ~117 µs | ~5.9 A |

MSD specifies the Blaster HVC for its 6-series capacitive-discharge boxes and
publishes a 0.7 Ω primary and ~40 kV output — 400 V against that output implies
roughly a 100:1 turns ratio, so rail and coil are matched.

Primary inductance is not a published figure for any ignition coil, and it does
not need to be for this controller: the firmware sets *when* the spark fires, not
the discharge dynamics. A coil at the far end of tolerance shifts rise time and
peak current but the spark still lands at the commanded crank angle, and even a
10× inductance error leaves the ring finishing ~45× inside one revolution. The
binding requirement is simply that the coil is manufacturer-stated for capacitive
discharge — a coil sold for a points or transistorised system is not, whatever
the brand on it.

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

`TRIGGER_LATENCY_US` is set to **8** — about 5 µs of propagation delay for the
specified A1101 plus ~3 µs of AVR interrupt latency through the
`attachInterrupt()` prologue. It is subtracted from the scheduled delay. Being a
fixed *time*, as an *angle* it grows with RPM and always retards the spark:

| RPM | 8 µs of latency |
|---|---|
| 1,200 | 0.06° |
| 6,500 | 0.31° |
| 11,000 | 0.53° |

Both terms are definitely non-zero, so 8 µs is a much better estimate than zero.
Trim it against the timing light during commissioning if you want the last tenth
of a degree at the top end.

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

## Commissioning

Every ignition build gets timed on the engine it runs on — `SENSOR_ANGLE` is a
physical measurement of your trigger position, and no firmware can verify it.

1. Confirm the magnet passes the A1101 with the specified air gap and that D2
   gives one clean falling edge per revolution.
2. Crank with the plug grounded and confirm spark.
3. **Put a timing light on it against a degree wheel** and check the fired angle
   matches the curve at idle and at a mid-range hold. If it reads consistently
   retarded at high RPM, raise `TRIGGER_LATENCY_US`.
4. Read `readWeakSparks()` after a full-throttle run. Any climb with revs means
   the charger is not keeping up.

> **This drives a live ignition system at 400 V and ~40 kV.** Discharge the
> capacitor bank before touching the power stage — 88 mJ at 400 V is enough to
> hurt, and the bank holds charge after the pack is disconnected. Bleed resistor
> across the bank is cheap insurance.
