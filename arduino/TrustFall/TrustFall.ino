// Trust Fall camera control. D9 servo, D5 motor enable, D7/D8 direction.
#include <Servo.h>
#include <stdlib.h>
#include <string.h>

constexpr uint8_t SERVO_PIN = 9, ENA_PIN = 5, IN1_PIN = 7, IN2_PIN = 8;
constexpr int LOW_US = 1300, HIGH_US = 1450, MIN_US = 980, MAX_US = 2000;
constexpr unsigned long INPUT_TIMEOUT_MS = 2000, SERVO_INTERVAL_MS = 20;
constexpr int STEP_US = 5;  // 250 microseconds of travel per second under camera control.
Servo tilt;
bool armed = false, receiving = false;
int actualPulse = LOW_US, targetPulse = LOW_US, motorSpeed = 0;
unsigned long lastInput = 0, lastStep = 0;
char line[32];
size_t lineLength = 0;
bool lineOverflow = false;

bool enableServo(int startingPulse) {
  if (!tilt.attached()) {
    tilt.attach(SERVO_PIN, MIN_US, MAX_US);
    if (!tilt.attached()) {
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
  targetPulse = actualPulse;  // Hold the weight of the ramp.
  receiving = false;
}

void reportStatus() {
  Serial.print(armed ? "ARMED" : "STOPPED");
  Serial.print(" pulse_us="); Serial.print(actualPulse);
  Serial.print(" low="); Serial.print(LOW_US);
  Serial.print(" high="); Serial.print(HIGH_US);
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
    if (armed) { Serial.println("ERR send STOP before CHECK"); return; }
    Serial.print("CHECK "); Serial.println(value);
    return;
  }
  if (!strcmp(command, "LEAN") && integerArgument(argument, 100, value)) {
    if (!armed) { Serial.println("ERR send ARM first"); return; }
    targetPulse = map(value, 0, 100, LOW_US, HIGH_US);
    receiving = true;
    lastInput = millis();
    return;
  }
  if (!strcmp(command, "SPEED") && integerArgument(argument, 255, value)) {
    motorSpeed = value;
    analogWrite(ENA_PIN, motorSpeed);
    reportStatus();
    return;
  }
  if (argument) { Serial.println("ERR use CHECK or LEAN 0..100, or SPEED 0..255"); return; }

  if (!strcmp(command, "STOP")) {
    pauseMotion();
    armed = false;
    Serial.println("STOPPED");
  } else if (!strcmp(command, "STATUS")) {
    reportStatus();
  } else if (!strcmp(command, "ARM")) {
    if (!enableServo(LOW_US)) return;
    armed = true;
    Serial.println("ARMED");
  } else {
    Serial.println("ERR commands: CHECK ARM LEAN SPEED STOP STATUS");
  }
}

void setup() {
  pinMode(ENA_PIN, OUTPUT);
  digitalWrite(ENA_PIN, LOW);
  pinMode(IN1_PIN, OUTPUT);
  pinMode(IN2_PIN, OUTPUT);
  digitalWrite(IN1_PIN, HIGH);
  digitalWrite(IN2_PIN, LOW);
  analogWrite(ENA_PIN, motorSpeed);  // Reserve D5 PWM before the Servo library allocates a timer.
  Serial.begin(115200);
  enableServo(LOW_US);
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
