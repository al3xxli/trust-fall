// Trust Fall camera demo, UNO R4 Minima. Fixed ramp, unloaded rocker on D9.
// Servo pulse widths are explicit. This sketch never reads or writes EEPROM.
#include <Servo.h>
#include <stdlib.h>
#include <string.h>

constexpr byte ENA = 5, IN1 = 7, IN2 = 8, SERVO_PIN = 9;
constexpr int UPRIGHT_US = 1350, CENTER_US = 1500, FULL_LEAN_US = 1650;
constexpr byte BELT_PWM = 160;
Servo rocker;
bool running = false;
int pulse = CENTER_US, target = CENTER_US;
unsigned long lastStep = 0;
char line[20];
size_t used = 0;
bool overflow = false;

void startBelt() {
  analogWrite(ENA, BELT_PWM);
  running = true;
}

void halt() {
  analogWrite(ENA, 0);
  running = false;
  target = pulse;  // Hold the unloaded rocker where it was stopped.
}

void handleLine() {
  if (!strcmp(line, "PROBE")) {
    Serial.println("TRUSTFALL DEMO 2");
    return;
  }
  if (!strcmp(line, "BELT ON")) {
    startBelt();
    Serial.println("BELT ON");
    return;
  }
  if (!strcmp(line, "HALT")) {
    halt();
    Serial.println("IDLE");
    return;
  }
  if (strncmp(line, "LEAN ", 5) || line[5] < '0' || line[5] > '9') return;
  char *end;
  long lean = strtol(line + 5, &end, 10);
  if (*end || lean < 0 || lean > 100) return;
  if (!running) return;  // Only BELT ON can restart an explicitly stopped belt.
  if (!rocker.attached()) {
    if (!rocker.attach(SERVO_PIN, 1000, 2000)) {
      Serial.println("ERR SERVO");
      return;
    }
    rocker.writeMicroseconds(pulse);
  }
  target = map(lean, 0, 100, UPRIGHT_US, FULL_LEAN_US);
  Serial.print("RUN ");
  Serial.println(pulse);
}

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  startBelt();  // The belt runs locally, even before the camera or USB connects.
  Serial.begin(115200);
}

void loop() {
  for (int i = 0; i < 64 && Serial.available(); ++i) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line[used] = '\0';
      if (!overflow) handleLine();
      used = 0;
      overflow = false;
    } else if (c >= 32 && c <= 126 && used < sizeof(line) - 1) {
      line[used++] = c;
    } else overflow = true;
  }
  unsigned long now = millis();
  if (rocker.attached() && pulse != target && now - lastStep >= 20) {
    lastStep = now;
    pulse += constrain(target - pulse, -6, 6);
    rocker.writeMicroseconds(pulse);
  }
}
