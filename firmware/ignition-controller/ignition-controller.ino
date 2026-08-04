#include <Arduino.h>
#include <util/atomic.h>
#include <avr/wdt.h>

/* ---------------------------------------------------------------------------
 * Single-cylinder CDI ignition controller
 * Target: Arduino Nano v3 (ATmega328P @ 16 MHz)
 *
 * A Hall sensor fires once per revolution at a fixed physical position BTDC.
 * The controller then waits (SENSOR_ANGLE - advance) degrees and pulses the
 * SCR gate to discharge the CDI.
 *
 * Timer1 free-runs at /64 (4 us per tick, 262.1 ms per wrap). The spark is
 * scheduled as an absolute compare target relative to the timer value captured
 * at the sensor edge, so the time spent computing inside the ISR is absorbed
 * rather than added to the delay as extra retard.
 * ------------------------------------------------------------------------- */

/* Pin map per the Freedom CDI Rev A firmware interface contract. */
const byte SENSOR_PIN       = 2;   // PD2, HALL_TRIG, INT0, falling edge
const byte SCR_PIN          = 4;   // PD4, GATE_CMD -> UCC27517A -> DA2099-AL pulse transformer
const byte MAP_SWITCH_PIN   = 7;   // PD7, MAP_SEL (HIGH/open = Curve 1, LOW = Curve 2)
const byte CHARGE_READY_PIN = 8;   // PB0, HV_READY from the TLV3012 comparator
const byte CHARGE_EN_PIN    = 9;   // PB1, CHARGE_EN_RAW (LOW disables the LT3751)
const byte FAULT_PIN        = A0;  // PC0, CHARGER_FAULT (LOW = LT3751 fault)

/* Startup and fault timing from the interface contract. D9 stays LOW through
 * reset and init; the charger is only enabled once the 5 V rail has settled and
 * the LT3751 is not reporting a fault. After a fault clears, D9 is held LOW for
 * a further interval before restarting regulation. */
const unsigned long POST_RESET_SETTLE_MS   = 20;
const unsigned long FAULT_RECOVERY_HOLD_MS = 10;

/* Gate pulse width. The SCR turns on in 1-2 us and self-commutates when the
 * discharge falls below holding current, so this only has to comfortably clear
 * turn-on. It is capped by the gate pulse transformer's volt-second product:
 * 5 V x 10 us = 50 V.us, roughly half the rating of the specified part. Do not
 * raise it without checking the transformer will not saturate. */
const unsigned int GATE_PULSE_US = 10;

/* Charge-ready interlock, from the independent TLV3012 HV comparator on D8
 * (~361.3 V rising, ~357.6 V falling). Deliberately NOT the LT3751 DONE pin:
 * DONE says a charge cycle finished, which is not the same claim as the rail
 * actually sitting at voltage, so the schematic routes DONE to a test point as
 * diagnostic only.
 *
 * D8 does not veto the spark -- a weak spark beats a guaranteed misfire -- but
 * firing with D8 LOW is counted, so an undersized charger shows up as a number
 * rather than a vague complaint about the engine going soft at high revs.
 *
 * The pin is a plain INPUT, not INPUT_PULLUP: HV_READY carries an external
 * 100k pulldown (R44), which an internal pull-up would fight. */
#define USE_CHARGE_READY 1

const float SENSOR_ANGLE    = 35.0; // Physical sensor position (degrees BTDC)
const float MIN_DELAY_ANGLE = 0.5;  // Never schedule closer than this to the sensor edge

// Reject edges closer together than this (noise spikes above ~22,200 RPM).
const unsigned long MIN_REV_DURATION_US = 2700UL;

/* Spark blanking. The dominant EMI source in a CDI is its own discharge, and it
 * is entirely predictable: the spark fires 11-34 degrees after the trigger and
 * the tank rings for ~98 us. Edges arriving inside that window are our own
 * ignition event, never the crank.
 *
 * A genuine edge is one full revolution away, so this can never mask one: even
 * at the 11,000 RPM limiter the next real edge is ~4.7 ms past the end of
 * blanking, and swallowing a real edge would need ~150,000 RPM. */
const unsigned long SPARK_BLANK_US = 400;

/* Plausibility gate for EMI outside the blanking and debounce windows. Rejects
 * an interval shorter than PLAUSIBLE_NUM/4 of the previous one.
 *
 * 3/4 allows the engine to gain 33% in one revolution; real single-cylinder
 * engines manage 5-10%, so this is still generous. The earlier 1/2 threshold
 * only caught spikes in the first half of the expected period and read anything
 * landing at 60% as genuine.
 *
 * After this many consecutive rejections we assume sync was genuinely lost
 * rather than lock the spark out forever. */
const uint8_t MAX_CONSECUTIVE_REJECTS = 3;

/* Fixed delay between the crank actually reaching SENSOR_ANGLE and this code
 * capturing TCNT1: Hall output propagation delay plus AVR interrupt latency
 * through attachInterrupt(). It is a constant time, so as an angle it grows
 * with RPM (0.06 deg at 1200 RPM, 0.53 deg at 11,000) and always retards.
 *
 * 8 us = ~5 us for the specified Allegro A1101 unipolar switch, plus ~3 us of
 * AVR interrupt latency through the attachInterrupt() prologue. Both terms are
 * definitely non-zero, so 8 is a far better estimate than leaving this at 0.
 * Trim it against a timing light during commissioning if you want the last
 * tenth of a degree at the top end. */
const unsigned long TRIGGER_LATENCY_US = 8UL;

// Below MIN_RPM the engine is not turning usefully. Withholding spark here also
// avoids over-advanced firing during a slow kick, which is what causes kickback.
const unsigned int MIN_RPM        = 100;
const unsigned int REV_LIMIT_RPM  = 11000; // hard spark cut above this
const unsigned int REV_RESUME_RPM = 10700; // hysteresis so the limiter cannot chatter

// Stall detection: no edge for this long clears the RPM readout and drops sync.
const unsigned long STALL_TIMEOUT_US = 1000000UL;

// Timer1: /64 prescaler, free-running.
const uint8_t       T1_PRESCALER_BITS = (1 << CS11) | (1 << CS10);
const unsigned long US_PER_TICK       = 4UL;

const unsigned long TRIGGER_LATENCY_TICKS =
    (TRIGGER_LATENCY_US + (US_PER_TICK / 2)) / US_PER_TICK; // rounded to nearest tick

/* Watchdog. loop() has no blocking calls, so it feeds the timer far more often
 * than every 250 ms; only a genuine hang will time out. A reset costs a spark
 * or two and a resync, which beats running the engine with no timing control.
 *
 * Some Nano bootloaders do not clear WDRF, which turns a single watchdog reset
 * into a permanent reset loop. Clearing it in .init3 runs before main() and
 * before anything can re-trigger it. */
const uint8_t WDT_TIMEOUT = WDTO_250MS;

void wdtDisableEarly(void) __attribute__((naked, used, section(".init3")));
void wdtDisableEarly(void) {
  MCUSR = 0;
  wdt_disable();
}

// Ignition Map Structure
struct TargetAdvance {
  unsigned int rpm;
  float advance;
};

const int MAP_SIZE = 6;

// CURVE 1: Aggressive Power Curve (Dry Track / Maximum Power)
const TargetAdvance curvePerformance[MAP_SIZE] = {
  { 1200,  15.0 },  // Smooth Idle
  { 3000,  20.0 },  // Rapid advance climb
  { 6500,  24.0 },  // Peak torque advance
  { 8500,  19.0 },  // Tapering to prevent detonation in powerband
  { 10000, 14.0 },  // Top-end safe retard
  { 11000, 10.0 }   // Advance held here up to the rev limiter
};

// CURVE 2: Linear / Safe Curve (Wet Track / Mud / Detonation Protection)
const TargetAdvance curveSafe[MAP_SIZE] = {
  { 1200,  13.0 },  // Soft idle
  { 3000,  17.0 },  // Retarded midrange for traction
  { 6500,  20.0 },  // Capped peak advance
  { 8500,  16.0 },  // Cooler running temperatures
  { 10000, 12.0 },
  { 11000, 8.0 }
};

/* --- Precomputed delay table -----------------------------------------------
 * The float interpolation is done once at boot, not once per revolution. The
 * ISR only indexes a table and does one 32-bit multiply/divide.
 *
 * Stored value is the delay angle in fixed point (degrees * ANGLE_FP), binned
 * by RPM. The ISR interpolates between adjacent bins, which holds the worst
 * deviation from the ideal curve to under 0.3 degrees across the whole range
 * (bin flooring alone would be 0.76 degrees near the steep top-end taper).
 *
 * One guard entry past the end so bin+1 is always safe to read.
 * -------------------------------------------------------------------------- */
const uint8_t  RPM_BIN_SHIFT = 7;   // 128 RPM per bin
const uint16_t RPM_BINS      = 96;  // covers 0 .. 12287 RPM
const uint16_t RPM_BIN_MASK  = (1 << RPM_BIN_SHIFT) - 1;
const uint32_t ANGLE_FP      = 64;  // fixed-point scale for the delay angle

uint16_t delayAngleTable[2][RPM_BINS + 1];

volatile unsigned long last_rev_time  = 0;
volatile unsigned long last_interval  = 0;
volatile unsigned int  latest_rpm     = 0;
volatile bool          have_reference = false;
volatile bool          rev_cut        = false;
volatile uint8_t       noise_rejects  = 0;
volatile uint8_t       active_curve   = 0;  // single byte: atomic against the ISR
volatile unsigned int  weak_spark_count = 0;
volatile bool          charger_fault  = false;
volatile unsigned int  fault_count    = 0;
volatile unsigned long blank_until    = 0;
volatile unsigned int  blanked_count  = 0;

// Linear Interpolation Math Function
float calculateAdvance(unsigned int current_rpm, const TargetAdvance* activeMap) {
  // Clamp boundaries
  if (current_rpm <= activeMap[0].rpm) return activeMap[0].advance;
  if (current_rpm >= activeMap[MAP_SIZE - 1].rpm) return activeMap[MAP_SIZE - 1].advance;

  // Find lookup window
  for (int i = 0; i < MAP_SIZE - 1; i++) {
    if (current_rpm >= activeMap[i].rpm && current_rpm <= activeMap[i + 1].rpm) {
      float rpm_span = activeMap[i + 1].rpm - activeMap[i].rpm;
      float pct = (current_rpm - activeMap[i].rpm) / rpm_span;
      return activeMap[i].advance + pct * (activeMap[i + 1].advance - activeMap[i].advance);
    }
  }
  return 12.0;
}

void buildDelayTable(uint8_t slot, const TargetAdvance* activeMap) {
  for (uint16_t bin = 0; bin <= RPM_BINS; bin++) {
    unsigned int rpm = (unsigned int)bin << RPM_BIN_SHIFT;
    float delay_angle = SENSOR_ANGLE - calculateAdvance(rpm, activeMap);

    // A map can never request advance at or beyond the sensor's own position:
    // the spark cannot be scheduled before its trigger arrives. Anything that
    // asks for it is silently capped here rather than in the ISR.
    if (delay_angle < MIN_DELAY_ANGLE) delay_angle = MIN_DELAY_ANGLE;
    if (delay_angle > SENSOR_ANGLE)    delay_angle = SENSOR_ANGLE;

    delayAngleTable[slot][bin] = (uint16_t)(delay_angle * ANGLE_FP + 0.5);
  }
}

// Hardware Interrupt: Fires at 35 degrees BTDC
void sensorISR() {
  unsigned int t1_edge = TCNT1;          // capture first, before any work
  unsigned long now = micros();
  unsigned long interval = now - last_rev_time;

  // Blanking: this edge is inside our own ignition event, not the crank.
  // Signed compare so the micros() rollover at ~71 minutes is handled.
  if ((long)(now - blank_until) < 0) {
    blanked_count++;
    return;
  }

  // Debounce noise spikes. The reference timestamp is only committed once the
  // edge is known to be genuine, so a rejected spike cannot corrupt the next
  // interval measurement.
  if (interval < MIN_REV_DURATION_US) return;

  // Plausibility gate for EMI landing outside the blanking and debounce
  // windows. Also rejected without committing the timestamp, so a spike cannot
  // skew the next measurement either.
  if (have_reference && last_interval != 0 &&
      interval < (last_interval - (last_interval >> 2))) {   // < 3/4 of previous
    if (++noise_rejects < MAX_CONSECUTIVE_REJECTS) return;
    have_reference = false;   // persistent mismatch: resync rather than lock out
  }
  noise_rejects = 0;

  last_rev_time = now;

  // The first edge after boot, a stall, or a resync has no valid interval
  // behind it.
  if (!have_reference) {
    have_reference = true;
    last_interval = 0;
    return;
  }

  last_interval = interval;

  unsigned int rpm = (unsigned int)(60000000UL / interval);
  latest_rpm = rpm;

  // Charger fault latched: keep measuring RPM for the dashboard, but do not
  // schedule a spark until the fault clears and regulation restarts.
  if (charger_fault) return;

  // Engine barely turning: no spark. This also keeps the tick math below within
  // 32 bits and within Timer1's 262 ms range.
  if (rpm < MIN_RPM) return;

  // Hard rev limiter: actually cuts the spark instead of just retarding it.
  if (rev_cut) {
    if (rpm >= REV_RESUME_RPM) return;
    rev_cut = false;
  } else if (rpm > REV_LIMIT_RPM) {
    rev_cut = true;
    return;
  }

  uint16_t bin = rpm >> RPM_BIN_SHIFT;
  if (bin > RPM_BINS - 1) bin = RPM_BINS - 1;

  // Interpolate between bins so the binning does not step the advance.
  int16_t a0 = (int16_t)delayAngleTable[active_curve][bin];
  int16_t a1 = (int16_t)delayAngleTable[active_curve][bin + 1];
  uint32_t angle_fp = (uint32_t)(a0 +
      (int16_t)(((int32_t)(a1 - a0) * (int32_t)(rpm & RPM_BIN_MASK)) >> RPM_BIN_SHIFT));

  // ticks = delay_angle * (interval / 360) / US_PER_TICK, in fixed point.
  // Worst case at MIN_RPM: 2240 * 600000 / 92160 = 14583 ticks, well within 16 bits.
  unsigned long ticks = (angle_fp * interval) / (ANGLE_FP * 360UL * US_PER_TICK);
  if (ticks > 65000UL) ticks = 65000UL;

  // Pull the spark forward to cancel the fixed trigger latency.
  ticks = (ticks > TRIGGER_LATENCY_TICKS) ? ticks - TRIGGER_LATENCY_TICKS : 0;

  // Never schedule into the past: a compare target already passed would not
  // match until the timer wrapped a full 262 ms later. Applied after the
  // latency correction so it stays the final authority on the target.
  unsigned int elapsed = (unsigned int)(TCNT1 - t1_edge);
  if (ticks < (unsigned long)elapsed + 4UL) ticks = (unsigned long)elapsed + 4UL;

  OCR1A = t1_edge + (unsigned int)ticks;
  TIFR1  |= (1 << OCF1A);     // flush stale flag
  TIMSK1 |= (1 << OCIE1A);    // arm compare match
}

/* Timer1 Match Interrupt: Executes precise spark discharge.
 *
 * PD4 drives the gate driver input, not the SCR gate itself -- the gate is fed
 * through a pulse transformer, so the MCU is galvanically clear of the 400 V
 * stage and the SCR does not have to be a low-side, sensitive-gate part.
 * See README "CDI power stage" for the specified chain. */
ISR(TIMER1_COMPA_vect) {
  TIMSK1 &= ~(1 << OCIE1A);   // Turn off self until next cycle

#if USE_CHARGE_READY
  // Fire regardless, but record that this one went out under-charged.
  if (!(PINB & (1 << PINB0))) weak_spark_count++;
#endif

  PORTD |= (1 << PORTD4);            // Gate driver input high
  delayMicroseconds(GATE_PULSE_US);  // Clear the SCR's turn-on delay
  PORTD &= ~(1 << PORTD4);           // Gate driver input low

  // Ignore crank edges until our own discharge has finished ringing.
  blank_until = micros() + SPARK_BLANK_US;
}

// Safe accessors for external dashboards / shift lights.
unsigned int readRpm() {
  unsigned int r;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    r = latest_rpm;
  }
  return r;
}

// Sparks fired before the capacitor reached voltage. A number that climbs with
// revs means the charger is undersized for the rate being asked of it.
unsigned int readWeakSparks() {
  unsigned int w;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    w = weak_spark_count;
  }
  return w;
}

// LT3751 fault events since boot, and whether one is currently latched.
unsigned int readFaultCount() {
  unsigned int f;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    f = fault_count;
  }
  return f;
}

bool chargerFaulted() {
  return charger_fault;   // single byte: atomic on AVR
}

// Edges discarded because they fell inside our own spark event. A steady count
// of roughly one per spark is normal and means blanking is doing its job.
unsigned int readBlankedEdges() {
  unsigned int b;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    b = blanked_count;
  }
  return b;
}

void setup() {
  // Both outputs must be LOW before they become outputs: the gate command so it
  // cannot glitch the SCR, and the charger enable so the LT3751 stays shut down
  // until initialisation finishes. Both pins are still high-Z during reset
  // itself, which firmware cannot cover -- the external pulldowns do that.
  PORTD &= ~(1 << PORTD4);
  PORTB &= ~(1 << PORTB1);
  pinMode(SCR_PIN, OUTPUT);
  pinMode(CHARGE_EN_PIN, OUTPUT);

  pinMode(SENSOR_PIN, INPUT_PULLUP);
  pinMode(MAP_SWITCH_PIN, INPUT_PULLUP); // Uses internal pullup resistor
  pinMode(FAULT_PIN, INPUT);             // external pull-up via R7/R8
#if USE_CHARGE_READY
  pinMode(CHARGE_READY_PIN, INPUT);      // external 100k pulldown R44
#endif

  buildDelayTable(0, curvePerformance);
  buildDelayTable(1, curveSafe);
  active_curve = (PIND & (1 << PIND7)) ? 0 : 1;

  // Configure continuous 16-bit Timer1 clock
  TCCR1A = 0;
  TCCR1B = T1_PRESCALER_BITS; // Prescaler 64, free-running
  TIMSK1 = 0;

  // Let the 5 V rail settle before enabling regulation, then start the charger
  // only if the LT3751 is not already asserting a fault.
  delay(POST_RESET_SETTLE_MS);
  if (PINC & (1 << PINC0)) {
    PORTB |= (1 << PORTB1);   // CHARGE_EN_RAW high: enable regulation
  } else {
    charger_fault = true;     // latched; loop() runs the recovery sequence
    fault_count++;
  }

  attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), sensorISR, FALLING);

  wdt_enable(WDT_TIMEOUT);
}

void loop() {
  wdt_reset(); // fed only from loop(), so a hung main path still resets

  /* Charger fault handling. A0 LOW means the LT3751 is faulted: shut the
   * charger down, drop any spark already armed, and force the gate command low.
   * Once A0 recovers, hold the charger off a further FAULT_RECOVERY_HOLD_MS
   * before restarting regulation, so a chattering fault cannot free-run. */
  static bool hold_running = false;
  static unsigned long hold_started_at = 0;

  if (!(PINC & (1 << PINC0))) {            // fault asserted
    if (!charger_fault) {
      charger_fault = true;
      fault_count++;
    }
    PORTB &= ~(1 << PORTB1);               // CHARGE_EN_RAW low
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
      TIMSK1 &= ~(1 << OCIE1A);            // disarm a pending compare
      PORTD &= ~(1 << PORTD4);             // gate command low
    }
    hold_running = false;
  } else if (charger_fault) {              // fault gone, run the hold-off
    if (!hold_running) {
      hold_running = true;
      hold_started_at = millis();
    } else if (millis() - hold_started_at >= FAULT_RECOVERY_HOLD_MS) {
      PORTB |= (1 << PORTB1);              // restart regulation
      charger_fault = false;
      hold_running = false;
    }
  }

  // Map switch is debounced out here rather than sampled inside the ISR, so a
  // bouncing contact cannot flip curves part-way through a revolution.
  static uint8_t last_raw = 0xFF;
  static unsigned long changed_at = 0;

  uint8_t raw = (PIND & (1 << PIND7)) ? 0 : 1; // 0 = Curve 1 (open), 1 = Curve 2 (to ground)
  if (raw != last_raw) {
    last_raw = raw;
    changed_at = millis();
  } else if (raw != active_curve && (millis() - changed_at) > 50) {
    active_curve = raw;
  }

  // Stall detection: drop sync so the next edge is treated as a fresh reference.
  unsigned long since_edge;
  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    since_edge = micros() - last_rev_time;
  }
  if (since_edge > STALL_TIMEOUT_US) {
    ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
      latest_rpm = 0;
      have_reference = false;
      rev_cut = false;
      last_interval = 0;
      noise_rejects = 0;
    }
  }
}
