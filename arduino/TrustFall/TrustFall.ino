/*
  Trust Fall | Arduino UNO R4 Minima, MG995 tilt servo, L298N channel A.
  D9 = servo signal, D5 = ENA (jumper removed), D7 = IN1, D8 = IN2.
  External actuator power, common ground. The Arduino barrel jack powers the board.

  First use: open Serial Monitor, 115200, Newline. With the rocker disconnected,
  send CAL to center the servo. Fit the rocker with the ramp at mid-travel (~26°).
  Use + or - to jog in 10 microsecond increments. Measure the ramp inclination.
  At ~20° send LOW; at ~32° send HIGH. Stay short of binding at either end.
  Send SAVE to keep both positions across power cycles. Either spline direction works.

  With both actuators disconnected, CHECK 0..100 echoes the value received over USB.
  This tests the camera-to-board link with the board disarmed, before calibration.
  ARM enables control. LEAN 0..100 moves the ramp and runs the belt in one direction.
  A single LEAN command gives a two-second bench test. For continuous motion send
  LEAN at 5–10 Hz. SPEED 0..255 sets motor PWM until reset. STOP immediately disables
  the motor and holds the current servo position. STATUS reports settings and state.
*/
#include <Servo.h>
#include <EEPROM.h>
#include <stdlib.h>
#include <string.h>

constexpr uint8_t SERVO_PIN = 9, ENA_PIN = 5, IN1_PIN = 7, IN2_PIN = 8;
constexpr int CENTER_US = 1500, MIN_US = 1000, MAX_US = 2000;
constexpr unsigned long INPUT_TIMEOUT_MS = 2000, SERVO_INTERVAL_MS = 20;
constexpr int STEP_US = 5;  // 250 microseconds of travel per second under camera control.
constexpr uint32_t SETTINGS_TAG = 0x54464C31;  // TFL1

struct Calibration {
  uint32_t tag;
  int16_t shallow;
  int16_t steep;
};

Calibration saved = {};
Servo tilt;
bool calibrating = false, armed = false, receiving = false;
int shallowMark = 0, steepMark = 0;
int actualPulse = CENTER_US, targetPulse = CENTER_US, motorSpeed = 160;
unsigned long lastInput = 0, lastStep = 0;
char line[32];
size_t lineLength = 0;
bool lineOverflow = false;

bool usableEndpoints(int shallow, int steep) {
  return shallow >= MIN_US && shallow <= MAX_US && steep >= MIN_US &&
         steep <= MAX_US && abs(steep - shallow) >= 20;
}

bool hasCalibration() {
  return saved.tag == SETTINGS_TAG && usableEndpoints(saved.shallow, saved.steep);
}

bool enableServo(int startingPulse) {
  if (!tilt.attached()) {
    if (!tilt.attach(SERVO_PIN, MIN_US, MAX_US)) {
      Serial.println("ERR servo timer unavailable");
      return false;
    }
    actualPulse = startingPulse;
    tilt.writeMicroseconds(actualPulse);
  }
  targetPulse = actualPulse;
  return true;
}

void pauseMotion() {
  analogWrite(ENA_PIN, 0);
  targetPulse = actualPulse;  // Hold the weight of the ramp.
  receiving = false;
}

void reportStatus() {
  Serial.print(calibrating ? "CALIBRATING" : (armed ? "ARMED" : "STOPPED"));
  Serial.print(" pulse_us="); Serial.print(actualPulse);
  Serial.print(" low="); Serial.print(hasCalibration() ? saved.shallow : 0);
  Serial.print(" high="); Serial.print(hasCalibration() ? saved.steep : 0);
  Serial.print(" speed="); Serial.print(motorSpeed);
  Serial.print(" input="); Serial.println(receiving ? "live" : "idle");
}

// Invalid or incomplete lines must never become a zero-lean motion command.
bool integerArgument(const char *text, int maximum, int &result) {
  if (!text || *text < '0' || *text > '9') return false;
  char *end;
  long value = strtol(text, &end, 10);
  if (*end || value < 0 || value > maximum) return false;
  result = static_cast<int>(value);
  return true;
}

void handleCommand(char *command) {
  char *argument = strchr(command, ' ');
  if (argument) *argument++ = '\0';
  int value;
  if (!strcmp(command, "CHECK") && integerArgument(argument, 100, value)) {
    if (armed || calibrating) { Serial.println("ERR send STOP before CHECK"); return; }
    Serial.print("CHECK "); Serial.println(value);
    return;
  }
  if (!strcmp(command, "LEAN") && integerArgument(argument, 100, value)) {
    if (!armed) { Serial.println("ERR send ARM first"); return; }
    targetPulse = map(value, 0, 100, saved.shallow, saved.steep);
    if (!receiving) analogWrite(ENA_PIN, motorSpeed);
    receiving = true;
    lastInput = millis();
    return;
  }
  if (!strcmp(command, "SPEED") && integerArgument(argument, 255, value)) {
    motorSpeed = value;
    if (receiving) analogWrite(ENA_PIN, motorSpeed);
    reportStatus();
    return;
  }
  if (argument) { Serial.println("ERR use CHECK or LEAN 0..100, or SPEED 0..255"); return; }

  if (!strcmp(command, "STOP")) {
    pauseMotion();
    armed = calibrating = false;
    Serial.println("STOPPED");
  } else if (!strcmp(command, "STATUS")) {
    reportStatus();
  } else if (!strcmp(command, "CAL")) {
    pauseMotion();
    armed = false;
    if (!enableServo(CENTER_US)) return;
    actualPulse = targetPulse = CENTER_US;
    tilt.writeMicroseconds(CENTER_US);
    shallowMark = steepMark = 0;
    calibrating = true;
    Serial.println("CALIBRATING: jog with + or -, mark LOW and HIGH, then SAVE");
  } else if (!strcmp(command, "ARM")) {
    if (calibrating || !hasCalibration()) {
      Serial.println("ERR complete CAL, LOW, HIGH, SAVE first");
      return;
    }
    if (!enableServo((saved.shallow + saved.steep) / 2)) return;
    armed = true;
    Serial.println("ARMED");
  } else if (calibrating && (!strcmp(command, "+") || !strcmp(command, "-"))) {
    actualPulse = constrain(actualPulse + (command[0] == '+' ? 10 : -10), MIN_US, MAX_US);
    targetPulse = actualPulse;
    tilt.writeMicroseconds(actualPulse);
    reportStatus();
  } else if (calibrating && (!strcmp(command, "LOW") || !strcmp(command, "HIGH"))) {
    if (command[0] == 'L') shallowMark = actualPulse;
    else steepMark = actualPulse;
    Serial.print(command); Serial.print(" marked at "); Serial.println(actualPulse);
  } else if (calibrating && !strcmp(command, "SAVE")) {
    if (!usableEndpoints(shallowMark, steepMark)) {
      Serial.println("ERR mark two distinct measured positions with LOW and HIGH");
      return;
    }
    saved = {SETTINGS_TAG, static_cast<int16_t>(shallowMark), static_cast<int16_t>(steepMark)};
    EEPROM.put(0, saved);
    calibrating = false;
    Serial.println("SAVED; send ARM to enable control");
  } else {
    Serial.println("ERR commands: CHECK CAL + - LOW HIGH SAVE ARM LEAN SPEED STOP STATUS");
  }
}

void setup() {
  pinMode(ENA_PIN, OUTPUT);
  digitalWrite(ENA_PIN, LOW);
  pinMode(IN1_PIN, OUTPUT);
  pinMode(IN2_PIN, OUTPUT);
  digitalWrite(IN1_PIN, HIGH);
  digitalWrite(IN2_PIN, LOW);
  analogWrite(ENA_PIN, 0);  // Reserve D5 PWM before the Servo library allocates a timer.
  Serial.begin(115200);
  EEPROM.get(0, saved);
}

void loop() {
  // Bound each pass so a stream of serial bytes can't delay motion control.
  for (int n = 0; n < 64 && Serial.available(); ++n) {
    char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      if (!lineOverflow && lineLength) {
        line[lineLength] = '\0';
        handleCommand(line);
      } else if (lineOverflow) {
        Serial.println("ERR invalid line");
      }
      lineLength = 0;
      lineOverflow = false;
    } else if (!lineOverflow && c >= 32 && c <= 126 && lineLength < sizeof(line) - 1) {
      line[lineLength++] = c;
    } else {
      lineOverflow = true;
    }
  }

  unsigned long now = millis();
  if (receiving && now - lastInput >= INPUT_TIMEOUT_MS) pauseMotion();
  if (receiving && now - lastStep >= SERVO_INTERVAL_MS) {
    lastStep = now;
    actualPulse += constrain(targetPulse - actualPulse, -STEP_US, STEP_US);
    tilt.writeMicroseconds(actualPulse);
  }
}
